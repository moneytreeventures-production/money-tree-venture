import assert from "node:assert/strict";
import { test } from "node:test";
import { seedCategories, seedProducts } from "../../scripts/seed/source-products";
import { assertSeedApplyTarget, buildProductSeedPlan } from "../../scripts/seed/product-seed-plan";

test("source catalogue is fully recognized without coercing paid video into PDF products", () => {
  const plan = buildProductSeedPlan();
  assert.equal(plan.categories.length, 4);
  assert.equal(plan.products.length, 10);
  assert.equal(plan.products.filter((entry) => entry.status === "draft_ready").length, 2);
  assert.equal(plan.products.filter((entry) => entry.status === "blocked_unsupported_format").length, 8);
  assert.deepEqual(plan.categories.map((category) => category.slug), seedCategories.map((category) => category.slug));

  const pdf = plan.products.find((entry) => entry.source.format === "pdf");
  assert.equal(pdf?.product?.productType, "pdf");
  assert.equal(pdf?.product?.pricePaise, pdf?.source.price ? pdf.source.price * 100 : undefined);
  assert.equal(pdf?.product?.name, pdf?.source.title);
  assert.equal(pdf?.product?.description, pdf?.source.description);
  assert.deepEqual(pdf?.product?.faqs, pdf?.source.faqs);

  const call = plan.products.find((entry) => entry.source.format === "consultation");
  assert.equal(call?.product?.productType, "call_guidance");
  assert.equal(call?.product?.pricePaise, 49900);
  assert.ok(plan.products.find((entry) => entry.source.format === "bundle")?.reason?.includes("PDF-only"));
  assert.ok(plan.products.filter((entry) => entry.source.format === "video" || entry.source.format === "video_and_files")
    .every((entry) => entry.status === "blocked_unsupported_format"));
});

test("unpersisted source-only fields are disclosed for every source row", () => {
  const plan = buildProductSeedPlan();
  for (const entry of plan.products) {
    assert.deepEqual(entry.unpersistedSourceFields, ["formatDetail", "audience", "tags", "whoShouldBuy"]);
  }
});

test("invalid source category and pricing cannot be mapped", () => {
  const validPdf = seedProducts.find((product) => product.format === "pdf")!;
  assert.equal(buildProductSeedPlan(seedCategories, [{ ...validPdf, categorySlug: "missing" }]).products[0].status, "invalid_source");
  assert.equal(buildProductSeedPlan(seedCategories, [{ ...validPdf, originalPrice: validPdf.price }]).products[0].status, "invalid_source");
});

test("apply requires an exact named non-production database and explicit source-field acknowledgement", () => {
  const base = { databaseName: "moneytree_dev", confirmedDatabaseName: "moneytree_dev", apply: true, confirmNonProduction: true, acknowledgeUnpersistedFields: true };
  assert.doesNotThrow(() => assertSeedApplyTarget(base));
  assert.throws(() => assertSeedApplyTarget({ ...base, nodeEnv: "production" }), /disabled/);
  assert.throws(() => assertSeedApplyTarget({ ...base, databaseName: "moneytree", confirmedDatabaseName: "moneytree" }), /identify a non-production/);
  assert.throws(() => assertSeedApplyTarget({ ...base, confirmedDatabaseName: "another_dev" }), /exact configured database/);
  assert.throws(() => assertSeedApplyTarget({ ...base, acknowledgeUnpersistedFields: false }), /unmapped-source-fields/);
});
