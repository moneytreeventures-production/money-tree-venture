import "server-only";

import mongoose, { Types } from "mongoose";
import type { ZodType } from "zod";
import { ConflictError, NotFoundError, ValidationError } from "../errors/app-error";
import { connectToDatabase } from "../db/mongodb";
import { AuditLogModel, BookingModel, CategoryModel, CouponModel, OrderModel, OutboxEventModel, PersonalizedPdfModel, ProductAssetModel, ProductModel, PurchaseModel, type Product } from "../db/models";
import { getR2Storage } from "../storage/r2/client";
import {
  createProductSchema,
  listPublicProductsQuerySchema,
  listProductsQuerySchema,
  productSlugSchema,
  productStatusSchema,
  slugifyProductName,
  updateProductSchema,
} from "./product-validation";
import { assertProductStatusTransition } from "./product-policy";

function validateInput<T>(
  schema: ZodType<T>,
  input: unknown,
): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ValidationError(result.error.issues.map((issue) => ({
      field: issue.path.map(String).join(".") || "product",
      message: issue.message,
    })));
  }
  return result.data;
}

function productConflict(message: string): ConflictError {
  return new ConflictError(message);
}

function validateProductId(id: string): Types.ObjectId {
  if (!/^[a-f0-9]{24}$/i.test(id)) {
    throw new ValidationError([{ field: "productId", message: "Invalid product ID." }]);
  }
  return new Types.ObjectId(id);
}

function validateAdminId(id: string): Types.ObjectId {
  if (!/^[a-f0-9]{24}$/i.test(id)) {
    throw new ValidationError([{ field: "adminId", message: "A valid administrator identity is required." }]);
  }
  return new Types.ObjectId(id);
}

async function ensureSlugAvailable(slug: string, excludeId?: Types.ObjectId): Promise<void> {
  const filter = excludeId ? { slug, _id: { $ne: excludeId } } : { slug };
  if (await ProductModel.exists(filter)) throw productConflict("This URL slug is already used by another product.");
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error &&
    ((error as { code?: unknown }).code === 11000 || (error as { code?: unknown }).code === "11000");
}

async function saveProductWithAudit(
  product: InstanceType<typeof ProductModel>,
  adminId: Types.ObjectId,
  action: string,
  changedFields: string[],
): Promise<void> {
  const session = mongoose.connection.getClient().startSession();
  try {
    await session.withTransaction(async () => {
      await product.save({ session });
      await AuditLogModel.create([{
        actorType: "admin",
        actorUserId: adminId,
        action,
        targetType: "product",
        targetId: product._id.toString(),
        changedFields,
      }], { session });
    });
  } finally {
    await session.endSession();
  }
}

function relationValidationError(field: string): never {
  throw new ValidationError([{ field, message: "Product relationship is invalid or unavailable." }]);
}

interface ProductRelationships {
  productType: Product["productType"];
  categoryIds: Types.ObjectId[];
  includedProductIds: Types.ObjectId[];
  primaryAssetId?: Types.ObjectId;
  productId?: Types.ObjectId;
  requirePublishable?: boolean;
}

async function ensureProductRelationships(relationships: ProductRelationships): Promise<void> {
  const { categoryIds, includedProductIds, productId, productType, primaryAssetId, requirePublishable = false } = relationships;

  if (categoryIds.length) {
    const categories = await CategoryModel.find({ _id: { $in: categoryIds } })
      .select("_id status")
      .lean()
      .exec() as unknown as Array<{ _id: Types.ObjectId; status: string }>;
    if (categories.length !== categoryIds.length || categories.some((category) =>
      category.status === "archived" || (requirePublishable && category.status !== "active"))) {
      relationValidationError("categoryIds");
    }
  }

  if (productType === "pdf_bundle") {
    if (primaryAssetId || !includedProductIds.length) relationValidationError("includedProductIds");
    if (productId && includedProductIds.some((includedId) => includedId.equals(productId))) {
      relationValidationError("includedProductIds");
    }
    const includedProducts = await ProductModel.find({ _id: { $in: includedProductIds } })
      .select("_id productType publicationStatus primaryAssetId")
      .lean()
      .exec() as unknown as Array<Pick<Product, "productType" | "publicationStatus" | "primaryAssetId"> & { _id: Types.ObjectId }>;
    if (includedProducts.length !== includedProductIds.length || includedProducts.some((included) =>
      included.productType !== "pdf" || included.publicationStatus === "archived" ||
      (requirePublishable && included.publicationStatus !== "published"))) {
      relationValidationError("includedProductIds");
    }
    if (requirePublishable) {
      const assetIds = includedProducts.map((included) => included.primaryAssetId).filter((id): id is Types.ObjectId => Boolean(id));
      if (assetIds.length !== includedProducts.length) relationValidationError("includedProductIds");
      const assets = await ProductAssetModel.find({ _id: { $in: assetIds }, status: "active" })
        .select("_id productId")
        .lean()
        .exec() as unknown as Array<{ _id: Types.ObjectId; productId: Types.ObjectId }>;
      if (assets.length !== includedProducts.length || includedProducts.some((included) =>
        !assets.some((asset) => asset._id.equals(included.primaryAssetId!) && asset.productId.equals(included._id)))) {
        relationValidationError("includedProductIds");
      }
    }
    return;
  }

  if (includedProductIds.length) relationValidationError("includedProductIds");
  if (productType === "call_guidance" && primaryAssetId) relationValidationError("primaryAssetId");
  if (primaryAssetId) {
    if (!productId) relationValidationError("primaryAssetId");
    const status = requirePublishable ? "active" as const : { $in: ["draft", "active"] as const };
    const asset = await ProductAssetModel.exists({ _id: primaryAssetId, productId, status });
    if (!asset) relationValidationError("primaryAssetId");
  }
  if (requirePublishable && productType === "pdf" && !primaryAssetId) relationValidationError("primaryAssetId");
}

export async function createProduct(input: unknown, adminUserId: string) {
  await connectToDatabase();
  const adminId = validateAdminId(adminUserId);
  const data = validateInput(createProductSchema, input);
  const slug = data.slug ?? slugifyProductName(data.name);
  if (!slug) throw new ValidationError([{ field: "name", message: "A valid slug could not be generated." }]);

  await ensureSlugAvailable(slug);
  const categoryIds = data.categoryIds.map((id) => new Types.ObjectId(id));
  const includedProductIds = data.includedProductIds?.map((id) => new Types.ObjectId(id)) ?? [];
  await ensureProductRelationships({ productType: data.productType, categoryIds, includedProductIds });
  const product = new ProductModel({
    ...data,
    slug,
    categoryIds,
    includedProductIds,
    publicationStatus: "draft",
    currency: "INR",
  });

  try {
    await saveProductWithAudit(product, adminId, "product.created", ["product"]);
  } catch (error) {
    if (isDuplicateKeyError(error)) throw productConflict("This URL slug is already used by another product.");
    throw error;
  }
  return product.toObject();
}

export async function updateProduct(id: string, input: unknown, adminUserId: string) {
  await connectToDatabase();
  const adminId = validateAdminId(adminUserId);
  const productId = validateProductId(id);
  const data = validateInput(updateProductSchema, input);
  const product = await ProductModel.findById(productId);
  if (!product) throw new NotFoundError();
  const effectivePrice = data.pricePaise ?? product.pricePaise;
  const effectiveComparePrice = "compareAtPricePaise" in data ? data.compareAtPricePaise : product.compareAtPricePaise;
  if (effectiveComparePrice !== undefined && effectiveComparePrice !== null && effectiveComparePrice <= effectivePrice) {
    throw new ValidationError([{ field: "compareAtPricePaise", message: "Compare-at price must be higher than the selling price." }]);
  }

  const categoryIds = data.categoryIds?.map((item) => new Types.ObjectId(item)) ?? product.categoryIds;
  const includedProductIds = data.includedProductIds?.map((item) => new Types.ObjectId(item)) ?? product.includedProductIds;
  const primaryAssetId = "primaryAssetId" in data
    ? (data.primaryAssetId ? new Types.ObjectId(data.primaryAssetId) : undefined)
    : product.primaryAssetId;
  await ensureProductRelationships({
    productId: product._id,
    productType: product.productType,
    categoryIds,
    includedProductIds,
    primaryAssetId,
    requirePublishable: product.publicationStatus === "published",
  });

  if (data.slug !== undefined) {
    await ensureSlugAvailable(data.slug, productId);
    product.slug = data.slug;
  }
  if (data.name !== undefined) product.name = data.name;
  if (data.shortDescription !== undefined) product.shortDescription = data.shortDescription;
  if (data.description !== undefined) product.description = data.description;
  if (data.pricePaise !== undefined) product.pricePaise = data.pricePaise;
  if ("compareAtPricePaise" in data) product.compareAtPricePaise = data.compareAtPricePaise ?? undefined;
  if (data.imageRefs !== undefined) product.imageRefs = data.imageRefs;
  if ("promotionalVideoUrl" in data) product.promotionalVideoUrl = data.promotionalVideoUrl ?? undefined;
  if (data.features !== undefined) product.features = data.features;
  if (data.benefits !== undefined) product.benefits = data.benefits;
  if (data.includedContent !== undefined) product.includedContent = data.includedContent;
  if (data.faqs !== undefined) product.faqs = data.faqs;
  if (data.featured !== undefined) product.featured = data.featured;
  if (data.displayOrder !== undefined) product.displayOrder = data.displayOrder;
  if (data.categoryIds !== undefined) product.categoryIds = categoryIds;
  if ("seo" in data) product.seo = data.seo ?? undefined;
  if ("primaryAssetId" in data) product.primaryAssetId = data.primaryAssetId ? new Types.ObjectId(data.primaryAssetId) : undefined;
  if (data.includedProductIds !== undefined) product.includedProductIds = data.includedProductIds.map((item) => new Types.ObjectId(item));
  if ("callDurationMinutes" in data) product.callDurationMinutes = data.callDurationMinutes ?? undefined;
  if ("fulfilmentInstructions" in data) product.fulfilmentInstructions = data.fulfilmentInstructions ?? undefined;

  try {
    await saveProductWithAudit(product, adminId, "product.updated", Object.keys(data));
  } catch (error) {
    if (isDuplicateKeyError(error)) throw productConflict("This URL slug is already used by another product.");
    if (error instanceof mongoose.Error.VersionError) throw new ConflictError("Product was updated elsewhere. Reload it and try again.");
    throw error;
  }
  return product.toObject();
}

export async function listProducts(input: unknown = {}) {
  await connectToDatabase();
  const query = validateInput(listProductsQuerySchema, input);
  const filter: Record<string, unknown> = {};
  if (query.productType) filter.productType = query.productType;
  if (query.publicationStatus) filter.publicationStatus = query.publicationStatus;
  if (query.categoryId) filter.categoryIds = new Types.ObjectId(query.categoryId);
  if (query.ids) filter._id = { "$in": query.ids.map((id) => new Types.ObjectId(id)) };
  if (query.featured !== undefined) filter.featured = query.featured;
  if (query.search) filter.$text = { $search: query.search };
  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    filter.pricePaise = {
      ...(query.minPrice !== undefined ? { $gte: query.minPrice } : {}),
      ...(query.maxPrice !== undefined ? { $lte: query.maxPrice } : {}),
    };
  }
  const total = await ProductModel.countDocuments(filter);
  const totalPages = Math.ceil(total / query.pageSize);
  const page = Math.min(query.page, Math.max(1, totalPages));
  const sort: Record<string, 1 | -1> = query.sort === "newest" ? { createdAt: -1, _id: -1 }
    : query.sort === "price_asc" ? { pricePaise: 1, createdAt: -1, _id: -1 }
      : query.sort === "price_desc" ? { pricePaise: -1, createdAt: -1, _id: -1 }
        : query.sort === "featured" ? { featured: -1, displayOrder: 1, createdAt: -1, _id: -1 }
          : { displayOrder: 1, name: 1, createdAt: -1, _id: 1 };
  const products = await ProductModel.find(filter)
    .sort(sort)
    .skip((page - 1) * query.pageSize)
    .limit(query.pageSize)
    .lean()
    .exec();

  return {
    items: products,
    pagination: { page, pageSize: query.pageSize, total, totalPages },
  };
}

export async function listPublicProducts(input: unknown = {}) {
  await connectToDatabase();
  const query = validateInput(listPublicProductsQuerySchema, input);
  let categoryId = query.categoryId;
  let categoryVerifiedBySlug = false;
  if (query.category) {
    const category = await CategoryModel.findOne({ slug: query.category, status: "active" }).select("_id").lean().exec();
    if (!category) throw new NotFoundError();
    categoryId = String(category._id);
    categoryVerifiedBySlug = true;
  }
  if (categoryId && !categoryVerifiedBySlug) {
    const activeCategory = await CategoryModel.exists({ _id: new Types.ObjectId(categoryId), status: "active" });
    if (!activeCategory) throw new NotFoundError();
  }
  const filters = { ...query };
  delete filters.category;
  delete filters.categoryId;
  return await listProducts({ ...filters, ...(categoryId ? { categoryId } : {}), publicationStatus: "published", sort: query.sort ?? "featured" });
}

export async function getProductById(id: string) {
  await connectToDatabase();
  const productId = validateProductId(id);
  const product = await ProductModel.findById(productId).lean().exec();
  if (!product) throw new NotFoundError();
  return product;
}

export async function getPublicProductBySlug(slug: string) {
  await connectToDatabase();
  const validatedSlug = validateInput(productSlugSchema, slug);
  const product = await ProductModel.findOne({ slug: validatedSlug, publicationStatus: "published" }).lean().exec();
  if (!product) throw new NotFoundError();
  return product;
}

export async function getPublicProductPageData(slug: string) {
  const product = await getPublicProductBySlug(slug);
  const [categoryRecords, includedRecords] = await Promise.all([
    product.categoryIds.length
      ? CategoryModel.find({ _id: { $in: product.categoryIds }, status: "active" }).select("_id name slug").lean().exec()
      : Promise.resolve([]),
    product.productType === "pdf_bundle" && product.includedProductIds.length
      ? ProductModel.find({ _id: { $in: product.includedProductIds }, productType: "pdf", publicationStatus: "published" })
        .select("_id name slug shortDescription imageRefs pricePaise").lean().exec()
      : Promise.resolve([]),
  ]);
  const categories = categoryRecords.map((category) => ({ id: String(category._id), name: category.name, slug: category.slug }));
  const includedById = new Map(includedRecords.map((included) => [String(included._id), included]));
  const includedProducts = product.includedProductIds.flatMap((id) => {
    const included = includedById.get(String(id));
    return included ? [{ id: String(included._id), name: included.name, slug: included.slug, shortDescription: included.shortDescription, imageRefs: included.imageRefs, pricePaise: included.pricePaise }] : [];
  });
  return { product, categories, includedProducts };
}

export async function changeProductStatus(id: string, input: unknown, adminUserId: string) {
  await connectToDatabase();
  const productId = validateProductId(id);
  const data = validateInput(productStatusSchema, input);
  const actorId = validateAdminId(adminUserId);

  const product = await ProductModel.findById(productId);
  if (!product) throw new NotFoundError();
  assertProductStatusTransition(product.publicationStatus, data.status);
  if (product.publicationStatus === data.status) return product.toObject();

  if (data.status === "published") {
    await ensureProductRelationships({
      productId: product._id,
      productType: product.productType,
      categoryIds: product.categoryIds,
      includedProductIds: product.includedProductIds,
      primaryAssetId: product.primaryAssetId,
      requirePublishable: true,
    });
  }
  if (data.status !== "published" && product.productType === "pdf") {
    const publishedBundleCount = await ProductModel.countDocuments({
      productType: "pdf_bundle",
      publicationStatus: "published",
      includedProductIds: product._id,
    });
    if (publishedBundleCount > 0) throw productConflict("Unpublish or archive the bundles that include this PDF first.");
  }

  product.publicationStatus = data.status;
  if (data.status === "archived") {
    product.archivedAt = new Date();
    product.archivedBy = actorId;
  }
  try {
    await saveProductWithAudit(product, actorId, `product.${data.status}`, ["publicationStatus"]);
  } catch (error) {
    if (isDuplicateKeyError(error)) throw new ConflictError(error);
    if (error instanceof mongoose.Error.VersionError) throw new ConflictError("Product was updated elsewhere. Reload it and try again.");
    throw error;
  }
  return product.toObject();
}

/** Permanently removes only an unreferenced, non-published product and its private master assets. */
export async function deleteProduct(id: string, adminUserId: string): Promise<void> {
  await connectToDatabase();
  const productId = validateProductId(id);
  const actorId = validateAdminId(adminUserId);
  const product = await ProductModel.findById(productId);
  if (!product) throw new NotFoundError();
  if (product.publicationStatus === "published") {
    throw productConflict("Unpublish or archive this product before deleting it.");
  }
  const referencedByBundle = await ProductModel.exists({ _id: { $ne: productId }, includedProductIds: productId });
  const [hasOrders, hasPurchases, hasBookings, hasCouponRestrictions, hasOutboxReferences] = await Promise.all([
    OrderModel.exists({ $or: [{ "lines.productId": productId }, { "lines.includedProducts.productId": productId }] }),
    PurchaseModel.exists({ $or: [{ productId }, { "bundleItems.productId": productId }] }),
    BookingModel.exists({ productId }),
    CouponModel.exists({ allowedProductIds: productId }),
    OutboxEventModel.exists({ "payload.productIds": productId }),
  ]);
  if (referencedByBundle || hasOrders || hasPurchases || hasBookings || hasCouponRestrictions || hasOutboxReferences) {
    throw productConflict("This product is linked to an order, entitlement, booking, coupon, or bundle. Archive it to preserve those records.");
  }
  if (product.publicationStatus === "draft") {
    // Stop future publication/order races before contacting storage. If storage fails, the safe archived record remains.
    await changeProductStatus(id, { status: "archived" }, adminUserId);
  }
  const assets = await ProductAssetModel.find({ productId }).lean().exec();
  if (assets.length) {
    const assetIds = assets.map((asset) => asset._id);
    const referencedAsset = await Promise.all([
      OrderModel.exists({ $or: [{ "lines.asset.assetId": { $in: assetIds } }, { "lines.includedProducts.asset.assetId": { $in: assetIds } }] }),
      PurchaseModel.exists({ "bundleItems.assetId": { $in: assetIds } }),
      PersonalizedPdfModel.exists({ sourceAssetId: { $in: assetIds } }),
    ]);
    if (referencedAsset.some(Boolean)) throw productConflict("A PDF version is linked to a customer purchase. Archive the product to preserve access.");
    // R2 delete is idempotent. Database records are kept if the provider rejects any delete.
    const storage = getR2Storage();
    for (const asset of assets) await storage.delete(asset.objectKey);
  }
  const session = mongoose.connection.getClient().startSession();
  try {
    await session.withTransaction(async () => {
      // Recheck references inside the transaction before removing database records.
      const [latestProduct, order, purchase, booking, bundle, coupon, outbox] = await Promise.all([
        ProductModel.findById(productId).session(session),
        OrderModel.exists({ $or: [{ "lines.productId": productId }, { "lines.includedProducts.productId": productId }] }).session(session),
        PurchaseModel.exists({ $or: [{ productId }, { "bundleItems.productId": productId }] }).session(session),
        BookingModel.exists({ productId }).session(session),
        ProductModel.exists({ _id: { $ne: productId }, includedProductIds: productId }).session(session),
        CouponModel.exists({ allowedProductIds: productId }).session(session),
        OutboxEventModel.exists({ "payload.productIds": productId }).session(session),
      ]);
      if (!latestProduct) throw new NotFoundError();
      if (latestProduct.publicationStatus !== "archived" || order || purchase || booking || bundle || coupon || outbox) throw new ConflictError();
      await ProductAssetModel.deleteMany({ productId }, { session });
      await ProductModel.deleteOne({ _id: productId }, { session });
      await AuditLogModel.create([{
        actorType: "admin", actorUserId: actorId, action: "product.deleted", targetType: "product",
        targetId: productId.toString(), changedFields: ["product", "unreferencedPdfAssets"],
      }], { session });
    });
  } finally {
    await session.endSession();
  }
}
