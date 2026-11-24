import { seedCategories, seedProducts, type SeedProduct } from "./source-products";

export type SeedMappingStatus = "draft_ready" | "blocked_unsupported_format" | "invalid_source";
export class SeedApplyGuardError extends Error {}

export interface PlannedSeedProduct {
  source: SeedProduct;
  status: SeedMappingStatus;
  reason?: string;
  product?: {
    name: string;
    slug: string;
    shortDescription: string;
    description: string;
    productType: "pdf" | "call_guidance";
    categorySlug: string;
    pricePaise: number;
    compareAtPricePaise: number;
    features: string[];
    benefits: string[];
    includedContent: string[];
    faqs: SeedProduct["faqs"];
    featured: boolean;
    displayOrder: number;
  };
  unpersistedSourceFields: Array<"formatDetail" | "audience" | "tags" | "whoShouldBuy">;
}

const schemaUnsupportedFields = ["formatDetail", "audience", "tags", "whoShouldBuy"] as const;

export function buildProductSeedPlan(
  categories = seedCategories,
  products = seedProducts,
): { categories: typeof seedCategories; products: PlannedSeedProduct[] } {
  const categorySlugs = new Set(categories.map((category) => category.slug));
  const planned = products.map((source): PlannedSeedProduct => {
    if (!categorySlugs.has(source.categorySlug)) {
      return { source, status: "invalid_source", reason: "Unknown source category.", unpersistedSourceFields: [...schemaUnsupportedFields] };
    }
    if (![source.price, source.originalPrice].every((price) => Number.isSafeInteger(price) && price >= 0) ||
        source.originalPrice <= source.price || !Number.isSafeInteger(source.price * 100) || !Number.isSafeInteger(source.originalPrice * 100)) {
      return { source, status: "invalid_source", reason: "Source pricing must be whole INR and compare-at price must exceed selling price.", unpersistedSourceFields: [...schemaUnsupportedFields] };
    }
    if (source.format !== "pdf" && source.format !== "consultation") {
      return { source, status: "blocked_unsupported_format", reason: source.format === "bundle"
        ? "Source bundle contents promise unsupported video delivery and cannot be represented as a PDF-only bundle."
        : "Source promises paid video or video-plus-files; this project sells PDFs and Call Guidance only.", unpersistedSourceFields: [...schemaUnsupportedFields] };
    }

    return {
      source,
      status: "draft_ready",
      unpersistedSourceFields: [...schemaUnsupportedFields],
      product: {
        name: source.title,
        slug: source.slug,
        shortDescription: source.shortDescription,
        description: source.description,
        productType: source.format === "pdf" ? "pdf" : "call_guidance",
        categorySlug: source.categorySlug,
        pricePaise: source.price * 100,
        compareAtPricePaise: source.originalPrice * 100,
        features: [...source.features],
        benefits: [...source.benefits],
        includedContent: [...source.included],
        faqs: source.faqs.map(({ question, answer }) => ({ question, answer })),
        featured: source.isFeatured ?? false,
        displayOrder: source.leafNumber,
      },
    };
  });

  return { categories: [...categories], products: planned };
}

export function assertSeedApplyTarget(input: {
  nodeEnv?: string;
  databaseName: string;
  confirmedDatabaseName?: string;
  apply: boolean;
  confirmNonProduction: boolean;
  acknowledgeUnpersistedFields: boolean;
}): void {
  if (!input.apply) throw new SeedApplyGuardError("Apply mode is required.");
  if (input.nodeEnv === "production") throw new SeedApplyGuardError("Seed apply is disabled when NODE_ENV is production.");
  if (!input.confirmNonProduction || input.confirmedDatabaseName !== input.databaseName) {
    throw new SeedApplyGuardError("Pass --confirm-non-production and --target-db with the exact configured database name.");
  }
  if (!/(?:^|[-_])(dev|development|test|testing|staging|sandbox|local)(?:$|[-_])/i.test(input.databaseName)) {
    throw new SeedApplyGuardError("Configured database name must clearly identify a non-production target.");
  }
  if (!input.acknowledgeUnpersistedFields) {
    throw new SeedApplyGuardError("Pass --acknowledge-unmapped-source-fields after reviewing the source-only fields in the dry run.");
  }
}
