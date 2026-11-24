import { z } from "zod";

const productTypeSchema = z.enum(["pdf", "pdf_bundle", "call_guidance"]);
const bundleKindSchema = z.enum(["starter_kit", "bundle"]);
const slugSchema = z.string().trim().min(1).max(180).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const objectIdSchema = z.string().trim().regex(/^[a-f0-9]{24}$/i);
const objectIdListSchema = z.array(objectIdSchema).max(20).refine(
  (ids) => new Set(ids.map((id) => id.toLowerCase())).size === ids.length,
  "Categories must be unique.",
);
const productIdFilterSchema = z.union([z.string(), z.array(z.string())])
  .transform((value) => Array.isArray(value) ? value : value.split(","))
  .pipe(z.array(objectIdSchema).min(1).max(50))
  .refine((ids) => new Set(ids.map((id) => id.toLowerCase())).size === ids.length, "Product IDs must be unique.");
const textSchema = z.string().trim();
const descriptionSchema = textSchema.max(20_000);
const imageRefsSchema = z.array(textSchema.min(1).max(2048)).max(20).refine(
  (refs) => new Set(refs).size === refs.length,
  "Image references must be unique.",
);
const detailsListSchema = z.array(textSchema.min(1).max(500)).max(30);
const faqSchema = z.array(z.object({ question: textSchema.min(1).max(240), answer: textSchema.min(1).max(2000) }).strict()).max(30);
const promotionalVideoUrlSchema = z.string().trim().url().max(2048).refine((value) => value.startsWith("https://"), "Promotional video URL must use HTTPS.");
const includedProductIdsSchema = z.array(objectIdSchema).max(100).refine(
  (ids) => new Set(ids.map((id) => id.toLowerCase())).size === ids.length,
  "Included products must be unique.",
);
const priceSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const displayOrderSchema = z.number().int().min(0).max(1_000_000);
const inrCataloguePriceSchema = z.string().trim().regex(/^\d{1,9}(?:\.\d{1,2})?$/).transform((value) => {
  const [rupees, paise = ""] = value.split(".");
  return Number(rupees) * 100 + Number(paise.padEnd(2, "0"));
}).pipe(z.number().int().max(Number.MAX_SAFE_INTEGER));
const cataloguePriceSchema = z.union([inrCataloguePriceSchema, z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)]);
const productSortSchema = z.enum(["newest", "price_asc", "price_desc", "featured"]);

const productSeoSchema = z.object({
  title: textSchema.max(70).optional(),
  description: textSchema.max(180).optional(),
}).strict();

const productShapeFields = {
  name: textSchema.min(1).max(160),
  slug: slugSchema.optional(),
  shortDescription: textSchema.min(1).max(280),
  description: descriptionSchema.optional().default(""),
  productType: productTypeSchema,
  bundleKind: bundleKindSchema.optional(),
  categoryIds: objectIdListSchema.optional().default([]),
  pricePaise: priceSchema,
  compareAtPricePaise: priceSchema.optional(),
  imageRefs: imageRefsSchema.optional().default([]),
  promotionalVideoUrl: promotionalVideoUrlSchema.optional(),
  features: detailsListSchema.optional().default([]),
  benefits: detailsListSchema.optional().default([]),
  includedContent: detailsListSchema.optional().default([]),
  faqs: faqSchema.optional().default([]),
  featured: z.boolean().optional().default(false),
  displayOrder: displayOrderSchema.optional().default(0),
  seo: productSeoSchema.optional(),
  primaryAssetId: objectIdSchema.optional(),
  includedProductIds: includedProductIdsSchema.optional(),
  callDurationMinutes: z.number().int().min(1).max(480).optional(),
  fulfilmentInstructions: textSchema.min(1).max(4000).optional(),
};

function validateProductKind(
  value: { productType: z.infer<typeof productTypeSchema>; bundleKind?: z.infer<typeof bundleKindSchema>; includedProductIds?: string[]; primaryAssetId?: string },
  context: z.RefinementCtx,
) {
  if (value.productType === "pdf_bundle") {
    if (!value.bundleKind) context.addIssue({ code: "custom", path: ["bundleKind"], message: "Bundle kind is required for PDF bundles." });
    if (!value.includedProductIds?.length) context.addIssue({ code: "custom", path: ["includedProductIds"], message: "A PDF bundle must include at least one product." });
    if (value.primaryAssetId) context.addIssue({ code: "custom", path: ["primaryAssetId"], message: "PDF bundles use their included products." });
  } else {
    if (value.bundleKind) context.addIssue({ code: "custom", path: ["bundleKind"], message: "Bundle kind is only valid for PDF bundles." });
    if (value.includedProductIds?.length) context.addIssue({ code: "custom", path: ["includedProductIds"], message: "Only PDF bundles can include products." });
  }
  if (value.productType === "call_guidance" && value.primaryAssetId) {
    context.addIssue({ code: "custom", path: ["primaryAssetId"], message: "Call Guidance cannot have a PDF asset." });
  }
}

export const createProductSchema = z.object(productShapeFields).strict().superRefine((value, context) => {
  validateProductKind(value, context);
  if (value.compareAtPricePaise !== undefined && value.compareAtPricePaise <= value.pricePaise) context.addIssue({ code: "custom", path: ["compareAtPricePaise"], message: "Compare-at price must be higher than the selling price." });
  if (value.primaryAssetId) {
    context.addIssue({ code: "custom", path: ["primaryAssetId"], message: "Create the product before assigning its PDF asset." });
  }
});

export const updateProductSchema = z.object({
  name: productShapeFields.name.optional(),
  slug: slugSchema.optional(),
  shortDescription: productShapeFields.shortDescription.optional(),
  description: descriptionSchema.optional(),
  pricePaise: priceSchema.optional(),
  compareAtPricePaise: priceSchema.nullable().optional(),
  imageRefs: imageRefsSchema.optional(),
  promotionalVideoUrl: promotionalVideoUrlSchema.nullable().optional(),
  features: detailsListSchema.optional(),
  benefits: detailsListSchema.optional(),
  includedContent: detailsListSchema.optional(),
  faqs: faqSchema.optional(),
  featured: z.boolean().optional(),
  displayOrder: displayOrderSchema.optional(),
  seo: productSeoSchema.nullable().optional(),
  primaryAssetId: objectIdSchema.nullable().optional(),
  includedProductIds: includedProductIdsSchema.optional(),
  categoryIds: objectIdListSchema.optional(),
  callDurationMinutes: z.number().int().min(1).max(480).nullable().optional(),
  fulfilmentInstructions: textSchema.min(1).max(4000).nullable().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "At least one field must be provided.");

const listProductsQueryShape = z.object({
  productType: productTypeSchema.optional(),
  publicationStatus: z.enum(["draft", "published", "archived"]).optional(),
  categoryId: objectIdSchema.optional(),
  ids: productIdFilterSchema.optional(),
  featured: z.union([
    z.boolean(),
    z.enum(["true", "false"]).transform((value) => value === "true"),
  ]).optional(),
  search: z.string().trim().max(100).transform((value) => value.replace(/\s+/g, " ")).pipe(z.string().min(1).max(100)).optional(),
  category: slugSchema.optional(),
  minPrice: cataloguePriceSchema.optional(),
  maxPrice: cataloguePriceSchema.optional(),
  sort: productSortSchema.optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
}).strict();

function validateListPriceAndCategoryRange(value: {
  minPrice?: number;
  maxPrice?: number;
  category?: string;
  categoryId?: string;
}, context: z.RefinementCtx) {
  if (value.minPrice !== undefined && value.maxPrice !== undefined && value.minPrice > value.maxPrice) {
    context.addIssue({ code: "custom", path: ["maxPrice"], message: "Maximum price must be greater than or equal to minimum price." });
  }
  if (value.category && value.categoryId) {
    context.addIssue({ code: "custom", path: ["category"], message: "Use either a category slug or category ID, not both." });
  }
}

export const listProductsQuerySchema = listProductsQueryShape.superRefine(validateListPriceAndCategoryRange);

export const listPublicProductsQuerySchema = listProductsQueryShape.omit({ publicationStatus: true }).superRefine(validateListPriceAndCategoryRange);

export const productSlugSchema = slugSchema;

export const productStatusSchema = z.object({
  status: z.enum(["draft", "published", "archived"]),
}).strict();

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
export type ListPublicProductsQuery = z.infer<typeof listPublicProductsQuerySchema>;
export type ProductStatus = z.infer<typeof productStatusSchema>["status"];

export function slugifyProductName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180)
    .replace(/-+$/g, "");
}
