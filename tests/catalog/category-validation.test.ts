
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  categoryStatusSchema,
  createCategorySchema,
  listCategoriesQuerySchema,
  slugifyCategoryName,
  updateCategorySchema,
} from "../../src/lib/catalog/category-validation";

test("creates valid category input with defaults", () => {
  const result = createCategorySchema.parse({
    name: "Personal Finance",
  });

  assert.equal(result.name, "Personal Finance");
  assert.equal(result.description, "");
  assert.equal(result.displayOrder, 0);
});

test("rejects empty names and invalid slugs", () => {
  assert.equal(
    createCategorySchema.safeParse({ name: "" }).success,
    false,
  );

  assert.equal(
    createCategorySchema.safeParse({
      name: "Finance",
      slug: "Finance Category",
    }).success,
    false,
  );
});

test("rejects unknown fields", () => {
  const result = createCategorySchema.safeParse({
    name: "Finance",
    unexpectedField: true,
  });

  assert.equal(result.success, false);
});

test("generates URL-friendly slugs", () => {
  assert.equal(
    slugifyCategoryName("Personal Finance & Wealth"),
    "personal-finance-wealth",
  );

  assert.equal(
    slugifyCategoryName("  Café & Savings  "),
    "cafe-savings",
  );
});

test("rejects updates with no fields", () => {
  assert.equal(updateCategorySchema.safeParse({}).success, false);
});

test("allows clearing an image reference", () => {
  assert.equal(
    updateCategorySchema.safeParse({ imageRef: null }).success,
    true,
  );
});

test("accepts only supported category statuses", () => {
  assert.equal(
    categoryStatusSchema.safeParse({ status: "active" }).success,
    true,
  );

  assert.equal(
    categoryStatusSchema.safeParse({ status: "deleted" }).success,
    false,
  );
});

test("validates pagination and applies defaults", () => {
  const result = listCategoriesQuerySchema.parse({});

  assert.equal(result.page, 1);
  assert.equal(result.pageSize, 20);

  assert.equal(
    listCategoriesQuerySchema.safeParse({
      page: 0,
      pageSize: 500,
    }).success,
    false,
  );
});
