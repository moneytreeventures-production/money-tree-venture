import { loadEnvConfig } from "@next/env";
import mongoose from "mongoose";
import { connectToDatabase } from "../../src/lib/db/mongodb";
import { CategoryModel, ProductModel, UserModel } from "../../src/lib/db/models";
import { createCategory } from "../../src/lib/catalog/category-service";
import { createProduct } from "../../src/lib/catalog/product-service";
import { getServerEnv } from "../../src/lib/env/server";
import { getAllowedAdminEmails, isVerifiedOwnerGoogleIdentity, OWNER_ADMIN_EMAIL, readGoogleAccountIdentity } from "../../src/lib/auth/google-identity";
import { assertSeedApplyTarget, buildProductSeedPlan, SeedApplyGuardError } from "./product-seed-plan";

interface SeedArgs {
  apply: boolean;
  confirmNonProduction: boolean;
  targetDatabase?: string;
  acknowledgeUnpersistedFields: boolean;
}

export class ProductSeedUsageError extends Error {}

export function parseProductSeedArgs(args: readonly string[]): SeedArgs {
  const allowed = new Set(["--dry-run", "--apply", "--confirm-non-production", "--acknowledge-unmapped-source-fields"]);
  let apply = false;
  let confirmNonProduction = false;
  let acknowledgeUnpersistedFields = false;
  let targetDatabase: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--target-db") {
      targetDatabase = args[index + 1];
      if (!targetDatabase) throw new ProductSeedUsageError("--target-db requires a database name.");
      index += 1;
    } else if (allowed.has(arg)) {
      if (arg === "--apply") apply = true;
      if (arg === "--confirm-non-production") confirmNonProduction = true;
      if (arg === "--acknowledge-unmapped-source-fields") acknowledgeUnpersistedFields = true;
    } else {
      throw new ProductSeedUsageError(`Unknown seed argument: ${arg}`);
    }
  }
  if (apply && args.includes("--dry-run")) throw new ProductSeedUsageError("Choose either --dry-run or --apply.");
  if (!apply && (confirmNonProduction || targetDatabase || acknowledgeUnpersistedFields)) {
    throw new ProductSeedUsageError("Confirmation flags are only valid with --apply.");
  }
  return { apply, confirmNonProduction, targetDatabase, acknowledgeUnpersistedFields };
}

function printPlan(): void {
  const plan = buildProductSeedPlan();
  console.info(JSON.stringify({
    mode: "dry-run",
    sourceCategoryCount: plan.categories.length,
    categories: plan.categories.map(({ name, slug, sortOrder }) => ({ name, slug, displayOrder: sortOrder })),
    sourceProductCount: plan.products.length,
    products: plan.products.map(({ source, status, reason, product, unpersistedSourceFields }) => ({
      title: source.title,
      slug: source.slug,
      sourceFormat: source.format,
      mapping: status,
      ...(product ? { productType: product.productType, sellingPricePaise: product.pricePaise, compareAtPricePaise: product.compareAtPricePaise, initialStatus: "draft" } : {}),
      ...(reason ? { reason } : {}),
      sourceFieldsNotPersisted: unpersistedSourceFields,
    })),
    databaseMutations: 0,
  }, null, 2));
}

async function applyProductSeed(args: SeedArgs): Promise<void> {
  loadEnvConfig(process.cwd());
  const env = getServerEnv();
  const databaseName = env.MONGODB_DB_NAME;
  if (!databaseName) throw new Error("A configured MongoDB database name is required for apply mode.");
  assertSeedApplyTarget({
    nodeEnv: process.env.NODE_ENV,
    databaseName,
    confirmedDatabaseName: args.targetDatabase,
    apply: args.apply,
    confirmNonProduction: args.confirmNonProduction,
    acknowledgeUnpersistedFields: args.acknowledgeUnpersistedFields,
  });

  const plan = buildProductSeedPlan();
  if (plan.products.some((item) => item.status === "invalid_source")) {
    throw new Error("Source validation failed; resolve invalid source rows before applying.");
  }

  try {
    await connectToDatabase();
    if (mongoose.connection.name !== databaseName) throw new Error("Connected database does not match the configured target.");

    const adminProfile = await UserModel.findOne({ emailNormalized: OWNER_ADMIN_EMAIL, role: "admin", status: "active" }).lean().exec();
    if (!adminProfile) throw new Error("Active owner administrator profile was not found.");
    const identity = await readGoogleAccountIdentity(adminProfile.authUserId);
    if (!identity || !isVerifiedOwnerGoogleIdentity(identity, getAllowedAdminEmails())) throw new Error("Owner Google identity is not authorized for this seed operation.");

    const categoriesBySlug = new Map<string, { id: string; sourceName: string }>();
    const categoryConflicts: string[] = [];
    for (const sourceCategory of plan.categories) {
      const existing = await CategoryModel.findOne({ slug: sourceCategory.slug }).lean().exec();
      if (!existing) continue;
      const compatible = existing.name === sourceCategory.name && existing.displayOrder === sourceCategory.sortOrder && existing.status === "active";
      if (!compatible) categoryConflicts.push(sourceCategory.slug);
      else categoriesBySlug.set(sourceCategory.slug, { id: existing._id.toString(), sourceName: existing.name });
    }

    const existingProducts = await ProductModel.find({ slug: { $in: plan.products.map(({ source }) => source.slug) } }).lean().exec();
    const existingBySlug = new Map(existingProducts.map((product) => [product.slug, product]));
    const productConflicts: string[] = [];
    const alreadyPresent: string[] = [];
    for (const entry of plan.products) {
      if (!entry.product) continue;
      const existing = existingBySlug.get(entry.source.slug);
      if (!existing) continue;
      const category = await CategoryModel.findOne({ slug: entry.product.categorySlug }).select("_id").lean().exec();
      const same = existing.name === entry.product.name && existing.productType === entry.product.productType &&
        existing.pricePaise === entry.product.pricePaise && existing.compareAtPricePaise === entry.product.compareAtPricePaise &&
        existing.publicationStatus === "draft" && Boolean(category && existing.categoryIds.some((id) => id.equals(category._id)));
      if (same) alreadyPresent.push(entry.source.slug);
      else productConflicts.push(entry.source.slug);
    }
    if (categoryConflicts.length || productConflicts.length) {
      throw new Error(`Preflight conflict; no seed writes were made. Category slugs: ${categoryConflicts.join(",") || "none"}; product slugs: ${productConflicts.join(",") || "none"}.`);
    }

    for (const category of plan.categories) {
      if (categoriesBySlug.has(category.slug)) continue;
      const created = await createCategory({ name: category.name, slug: category.slug, displayOrder: category.sortOrder });
      categoriesBySlug.set(category.slug, { id: created._id.toString(), sourceName: created.name });
    }

    const created: string[] = [];
    const failed: string[] = [];
    for (const entry of plan.products) {
      if (!entry.product || alreadyPresent.includes(entry.source.slug)) continue;
      const { categorySlug, ...mappedProduct } = entry.product;
      const category = categoriesBySlug.get(categorySlug);
      if (!category) { failed.push(entry.source.slug); continue; }
      try {
        await createProduct({ ...mappedProduct, categoryIds: [category.id] }, adminProfile._id.toString());
        created.push(entry.source.slug);
      } catch {
        failed.push(entry.source.slug);
      }
    }
    console.info(JSON.stringify({ mode: "apply", database: databaseName, created, alreadyPresent, blocked: plan.products.filter((item) => item.status !== "draft_ready").map((item) => item.source.slug), failed, allCreatedAs: "draft" }, null, 2));
    if (failed.length) process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

export async function runProductSeed(args: readonly string[]): Promise<void> {
  const parsed = parseProductSeedArgs(args);
  if (!parsed.apply) {
    printPlan();
    return;
  }
  await applyProductSeed(parsed);
}

if (require.main === module) {
  void runProductSeed(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof ProductSeedUsageError || error instanceof SeedApplyGuardError
      ? error.message
      : "Product seed did not complete. Check non-production connectivity and slug conflicts; internal errors and credentials are not printed.");
    process.exitCode = 1;
  });
}
