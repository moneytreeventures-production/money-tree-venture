import { Schema, Types } from "mongoose";
import { isUniqueList, nonEmptyString, objectId, optionalPaise, optionalText, paise, registerModel, timestamps } from "./common";
import type { Model } from "mongoose";

export interface Category {
  name: string; slug: string; description: string; imageRef?: string; displayOrder: number;
  status: "active" | "inactive" | "archived"; createdAt?: Date; updatedAt?: Date;
}

export const categorySchema = new Schema<Category>({
  name: { ...nonEmptyString, maxlength: 120 },
  slug: { ...nonEmptyString, maxlength: 160, lowercase: true, match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/ },
  description: { type: String, trim: true, maxlength: 2000, default: "" },
  imageRef: optionalText(2048),
  displayOrder: { type: Number, min: 0, default: 0, validate: Number.isSafeInteger },
  status: { type: String, enum: ["active", "inactive", "archived"], default: "active", required: true },
}, { ...timestamps, collection: "categories" });

categorySchema.index({ slug: 1 }, { unique: true, name: "category_slug_unique" });
categorySchema.index({ status: 1, displayOrder: 1 }, { name: "category_public_order" });

export const CategoryModel = registerModel("MoneyTreeCategory", categorySchema) as unknown as Model<Category>;

interface ProductSeo { title?: string; description?: string }
const seoSchema = new Schema<ProductSeo>({
  title: { type: String, trim: true, maxlength: 70 },
  description: { type: String, trim: true, maxlength: 180 },
}, { _id: false, strict: "throw" });

const productFaqSchema = new Schema<{ question: string; answer: string }>({
  question: { ...nonEmptyString, maxlength: 240 },
  answer: { ...nonEmptyString, maxlength: 2000 },
}, { _id: false, strict: "throw" });

export interface Product {
  name: string; slug: string; shortDescription: string; description: string;
  productType: "pdf" | "pdf_bundle" | "call_guidance"; categoryIds: Types.ObjectId[];
  bundleKind?: "starter_kit" | "bundle";
  pricePaise: number; compareAtPricePaise?: number; currency: "INR"; imageRefs: string[];
  promotionalVideoUrl?: string; features: string[]; benefits: string[]; includedContent: string[];
  faqs: Array<{ question: string; answer: string }>;
  publicationStatus: "draft" | "published" | "archived"; featured: boolean; displayOrder: number;
  seo?: ProductSeo; primaryAssetId?: Types.ObjectId; includedProductIds: Types.ObjectId[];
  callDurationMinutes?: number; fulfilmentInstructions?: string; archivedAt?: Date; archivedBy?: Types.ObjectId;
  createdAt?: Date; updatedAt?: Date;
}

export const productSchema = new Schema<Product>({
  name: { ...nonEmptyString, maxlength: 160 },
  slug: { ...nonEmptyString, maxlength: 180, lowercase: true, match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/ },
  shortDescription: { ...nonEmptyString, maxlength: 280 },
  description: { type: String, trim: true, maxlength: 20_000, default: "" },
  productType: { type: String, enum: ["pdf", "pdf_bundle", "call_guidance"], required: true },
  bundleKind: { type: String, enum: ["starter_kit", "bundle"] },
  categoryIds: { type: [{ type: objectId, ref: "MoneyTreeCategory" }], default: [], validate: { validator: isUniqueList, message: "Product categories must not be duplicated." } },
  pricePaise: { ...paise },
  compareAtPricePaise: { ...optionalPaise },
  currency: { type: String, enum: ["INR"], default: "INR", required: true },
  imageRefs: { type: [String], default: [], validate: { validator: isUniqueList, message: "Product image references must be unique." } },
  promotionalVideoUrl: { type: String, trim: true, maxlength: 2048, match: /^https:\/\//i },
  features: { type: [String], default: [], validate: { validator: (items: string[]) => items.length <= 30 && items.every((item) => item.length > 0 && item.length <= 500) } },
  benefits: { type: [String], default: [], validate: { validator: (items: string[]) => items.length <= 30 && items.every((item) => item.length > 0 && item.length <= 500) } },
  includedContent: { type: [String], default: [], validate: { validator: (items: string[]) => items.length <= 30 && items.every((item: string) => item.length > 0 && item.length <= 500) } },
  faqs: { type: [productFaqSchema], default: [], validate: { validator: (items: unknown[]) => items.length <= 30 } },
  publicationStatus: { type: String, enum: ["draft", "published", "archived"], default: "draft", required: true },
  featured: { type: Boolean, default: false },
  displayOrder: { type: Number, min: 0, default: 0, validate: Number.isSafeInteger },
  seo: { type: seoSchema, default: () => ({}) },
  primaryAssetId: { type: objectId, ref: "MoneyTreeProductAsset" },
  includedProductIds: { type: [{ type: objectId, ref: "MoneyTreeProduct" }], default: [] },
  callDurationMinutes: { type: Number, min: 1, max: 480, validate: Number.isSafeInteger },
  fulfilmentInstructions: optionalText(4000),
  archivedAt: Date,
  archivedBy: { type: objectId, ref: "MoneyTreeUser" },
}, { ...timestamps, collection: "products", optimisticConcurrency: true });

productSchema.pre("validate", function validateProductShape() {
  if (this.compareAtPricePaise !== undefined && this.compareAtPricePaise <= this.pricePaise) {
    this.invalidate("compareAtPricePaise", "Compare-at price must be higher than the selling price.");
  }
  const hasBundleItems = this.includedProductIds.length > 0;
  if (this.productType === "pdf_bundle") {
    if (!this.bundleKind) this.invalidate("bundleKind", "A PDF bundle requires a bundle kind.");
    if (!hasBundleItems) this.invalidate("includedProductIds", "A PDF bundle must include at least one PDF product.");
    if (!isUniqueList(this.includedProductIds)) this.invalidate("includedProductIds", "A bundle cannot contain duplicate products.");
    if (this.includedProductIds.some((id) => id.equals(this._id))) this.invalidate("includedProductIds", "A bundle cannot include itself.");
    if (this.primaryAssetId) this.invalidate("primaryAssetId", "A bundle uses the included PDF products, not a direct master asset.");
  } else if (hasBundleItems) {
    this.invalidate("includedProductIds", "Only a PDF bundle can include other products.");
  }
  if (this.productType !== "pdf_bundle" && this.bundleKind) {
    this.invalidate("bundleKind", "Only a PDF bundle can have a bundle kind.");
  }

  if (this.productType === "call_guidance") {
    if (this.primaryAssetId) this.invalidate("primaryAssetId", "Call Guidance cannot have a downloadable PDF asset.");
    if (this.publicationStatus === "published") {
      if (!this.callDurationMinutes) this.invalidate("callDurationMinutes", "Published Call Guidance requires a session duration.");
      if (!this.fulfilmentInstructions) this.invalidate("fulfilmentInstructions", "Published Call Guidance requires fulfilment instructions.");
    }
  } else if (this.publicationStatus === "published" && this.productType === "pdf" && !this.primaryAssetId) {
    this.invalidate("primaryAssetId", "A published PDF product requires an assigned PDF asset.");
  }

  if (this.publicationStatus === "archived" && !this.archivedAt) {
    this.invalidate("archivedAt", "Archived products require an archive timestamp.");
  }
});

productSchema.index({ slug: 1 }, { unique: true, name: "product_slug_unique" });
productSchema.index({ publicationStatus: 1, displayOrder: 1, createdAt: -1 }, { name: "product_publication_order" });
productSchema.index({ categoryIds: 1, publicationStatus: 1, displayOrder: 1 }, { name: "product_category_publication" });
productSchema.index({ productType: 1, publicationStatus: 1, displayOrder: 1 }, { name: "product_type_publication" });
productSchema.index({ name: "text", shortDescription: "text", description: "text" }, { name: "product_public_text_search" });
productSchema.index({ publicationStatus: 1, pricePaise: 1, createdAt: -1, _id: -1 }, { name: "product_public_price_order" });
productSchema.index({ publicationStatus: 1, featured: -1, displayOrder: 1, createdAt: -1, _id: -1 }, { name: "product_public_featured_order" });
productSchema.index({ categoryIds: 1, publicationStatus: 1, featured: -1, displayOrder: 1 }, { name: "product_category_featured_order" });

export const ProductModel = registerModel("MoneyTreeProduct", productSchema) as unknown as Model<Product>;

export interface ProductAsset {
  productId: Types.ObjectId; assetType: "pdf_master"; storageProvider: "r2" | "s3";
  objectKey: string; version: string; originalFileName: string; sizeBytes: number;
  mimeType: "application/pdf"; sha256?: string; status: "draft" | "active" | "superseded" | "archived";
  copyrightNoticeVersion: string; uploadedBy: Types.ObjectId; createdAt?: Date; updatedAt?: Date;
}

export const productAssetSchema = new Schema<ProductAsset>({
  productId: { type: objectId, ref: "MoneyTreeProduct", required: true, immutable: true },
  assetType: { type: String, enum: ["pdf_master"], default: "pdf_master", required: true, immutable: true },
  storageProvider: { type: String, enum: ["r2", "s3"], default: "r2", required: true, immutable: true },
  objectKey: {
    ...nonEmptyString,
    maxlength: 1024,
    immutable: true,
    validate: { validator: (value: string) => !/^https?:\/\//i.test(value), message: "Store a private object key, not a public URL." },
  },
  version: { ...nonEmptyString, maxlength: 64, immutable: true, match: /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/ },
  originalFileName: { ...nonEmptyString, maxlength: 255, immutable: true },
  sizeBytes: { type: Number, required: true, min: 1, validate: Number.isSafeInteger, immutable: true },
  mimeType: { type: String, enum: ["application/pdf"], default: "application/pdf", required: true, immutable: true },
  sha256: { type: String, match: /^[a-f0-9]{64}$/i, immutable: true },
  status: { type: String, enum: ["draft", "active", "superseded", "archived"], default: "draft", required: true },
  copyrightNoticeVersion: { ...nonEmptyString, maxlength: 64 },
  uploadedBy: { type: objectId, ref: "MoneyTreeUser", required: true, immutable: true },
}, { ...timestamps, collection: "productAssets" });

productAssetSchema.index({ productId: 1, version: 1 }, { unique: true, name: "asset_product_version_unique" });
productAssetSchema.index({ productId: 1, status: 1, version: -1 }, { name: "asset_product_status_version" });
productAssetSchema.index({ productId: 1 }, { unique: true, partialFilterExpression: { status: "active" }, name: "asset_one_active_version_per_product" });
productAssetSchema.index({ storageProvider: 1, objectKey: 1 }, { unique: true, name: "asset_object_key_unique" });

export const ProductAssetModel = registerModel("MoneyTreeProductAsset", productAssetSchema) as unknown as Model<ProductAsset>;
