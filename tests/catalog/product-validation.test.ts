import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createProductSchema,
  listProductsQuerySchema,
  slugifyProductName,
  updateProductSchema,
} from "../../src/lib/catalog/product-validation";

const id1 = "64b64c000000000000000001";
const id2 = "64b64c000000000000000002";

test("validates product drafts and applies safe defaults", () => {
  const result = createProductSchema.parse({
    name: "PDF Guide",
    shortDescription: "A useful guide",
    productType: "pdf",
    pricePaise: 12_500,
  });
  assert.equal(result.description, "");
  assert.deepEqual(result.imageRefs, []);
  assert.equal(result.featured, false);
  assert.equal(result.displayOrder, 0);
});

test("requires bundle kind and included products for PDF bundles", () => {
  const missingKind = createProductSchema.safeParse({
    name: "Starter Kit", shortDescription: "A kit", productType: "pdf_bundle", pricePaise: 100, includedProductIds: [id1],
  });
  assert.equal(missingKind.success, false);

  const valid = createProductSchema.parse({
    name: "Starter Kit", shortDescription: "A kit", productType: "pdf_bundle", bundleKind: "starter_kit", pricePaise: 100, includedProductIds: [id1],
  });
  assert.equal(valid.bundleKind, "starter_kit");

  assert.equal(createProductSchema.safeParse({
    name: "Bundle", shortDescription: "A bundle", productType: "pdf_bundle", bundleKind: "bundle", pricePaise: 100,
  }).success, false);
});

test("rejects incompatible product fields, invalid IDs, and unknown lifecycle fields", () => {
  const base = { name: "Call Guidance", shortDescription: "One to one guidance", productType: "call_guidance", pricePaise: 25_000 };
  assert.equal(createProductSchema.safeParse({ ...base, primaryAssetId: id1 }).success, false);
  assert.equal(createProductSchema.safeParse({ ...base, bundleKind: "bundle" }).success, false);
  assert.equal(createProductSchema.safeParse({ ...base, includedProductIds: [id1] }).success, false);
  assert.equal(createProductSchema.safeParse({ ...base, primaryAssetId: "not-an-object-id" }).success, false);
  assert.equal(createProductSchema.safeParse({ ...base, publicationStatus: "published" }).success, false);
  assert.equal(createProductSchema.safeParse({ name: "Guide", shortDescription: "A guide", productType: "pdf", pricePaise: 100, primaryAssetId: id1 }).success, false);
});

test("validates exact paise values and rejects duplicate bundle product IDs", () => {
  const base = { name: "Bundle", shortDescription: "A bundle", productType: "pdf_bundle", bundleKind: "bundle", pricePaise: 100, includedProductIds: [id1] };
  assert.equal(createProductSchema.safeParse({ ...base, pricePaise: 10.5 }).success, false);
  assert.equal(createProductSchema.safeParse({ ...base, includedProductIds: [id1, id1] }).success, false);
  assert.equal(createProductSchema.safeParse({ ...base, includedProductIds: [id1, id2] }).success, true);
});

test("validates pricing, promotional media, and product presentation details", () => {
  const base = { name: "Guide", shortDescription: "A guide", productType: "pdf", pricePaise: 1000 };
  assert.equal(createProductSchema.safeParse({ ...base, compareAtPricePaise: 1000 }).success, false);
  assert.equal(createProductSchema.safeParse({ ...base, compareAtPricePaise: 999 }).success, false);
  assert.equal(createProductSchema.safeParse({ ...base, compareAtPricePaise: 1200, promotionalVideoUrl: "http://video.example.test/watch" }).success, false);
  assert.equal(createProductSchema.safeParse({ ...base, compareAtPricePaise: 1200, promotionalVideoUrl: "https://video.example.test/watch", features: ["Clear steps"], faqs: [{ question: "What?", answer: "Details." }] }).success, true);
  assert.equal(updateProductSchema.safeParse({ promotionalVideoUrl: "javascript:alert(1)" }).success, false);
});

test("updates cannot change product type or publication lifecycle and must change a field", () => {
  assert.equal(updateProductSchema.safeParse({}).success, false);
  assert.equal(updateProductSchema.safeParse({ productType: "pdf_bundle" }).success, false);
  assert.equal(updateProductSchema.safeParse({ publicationStatus: "published" }).success, false);
  assert.equal(updateProductSchema.safeParse({ pricePaise: 0 }).success, true);
  assert.equal(updateProductSchema.safeParse({ primaryAssetId: null }).success, true);
  assert.equal(updateProductSchema.safeParse({ compareAtPricePaise: null }).success, true);
});

test("validates list filters, boolean query strings and bounded pagination", () => {
  const defaults = listProductsQuerySchema.parse({});
  assert.equal(defaults.page, 1);
  assert.equal(defaults.pageSize, 20);
  assert.equal(listProductsQuerySchema.parse({ featured: "false" }).featured, false);
  assert.equal(listProductsQuerySchema.parse({ featured: "true", page: "2", pageSize: "50" }).featured, true);
  assert.equal(listProductsQuerySchema.safeParse({ page: 0 }).success, false);
  assert.equal(listProductsQuerySchema.safeParse({ pageSize: 101 }).success, false);
  const filters = listProductsQuerySchema.parse({ search: "  freelance   guide ", category: "ghar-se-kaam", minPrice: "99.50", maxPrice: "1200.00", sort: "price_asc" });
  assert.equal(filters.search, "freelance guide");
  assert.equal(filters.minPrice, 9950);
  assert.equal(filters.maxPrice, 120000);
  assert.equal(listProductsQuerySchema.safeParse({ minPrice: "99.50", maxPrice: "10.00" }).success, false);
  assert.equal(listProductsQuerySchema.safeParse({ minPrice: "1,000" }).success, false);
  assert.equal(listProductsQuerySchema.safeParse({ category: "INVALID SLUG" }).success, false);
  assert.equal(listProductsQuerySchema.safeParse({ sort: "random" }).success, false);
  assert.equal(listProductsQuerySchema.safeParse({ unexpected: "field" }).success, false);
  assert.equal(listProductsQuerySchema.safeParse({ categoryId: "invalid" }).success, false);
  assert.deepEqual(listProductsQuerySchema.parse({ ids: id1 + "," + id2 }).ids, [id1, id2]);
  assert.equal(listProductsQuerySchema.safeParse({ ids: id1 + "," + id1 }).success, false);
  assert.equal(listProductsQuerySchema.safeParse({ ids: "invalid" }).success, false);
});

test("validates unique category IDs and unique image references", () => {
  const base = { name: "Guide", shortDescription: "A guide", productType: "pdf", pricePaise: 100 };
  assert.equal(createProductSchema.safeParse({ ...base, categoryIds: [id1, id1] }).success, false);
  assert.equal(createProductSchema.safeParse({ ...base, categoryIds: ["bad-id"] }).success, false);
  assert.equal(createProductSchema.safeParse({ ...base, imageRefs: ["cover", "cover"] }).success, false);
});

test("generates stable URL-friendly product slugs", () => {
  assert.equal(slugifyProductName("  Café & Freelance Kit  "), "cafe-freelance-kit");
  assert.equal(slugifyProductName("!!!"), "");
});
