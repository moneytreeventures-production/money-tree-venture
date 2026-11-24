import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeProductCategoryIds, toggleProductCategory } from "../../src/lib/catalog/category-selection";

const active = "64b64c000000000000000001";
const second = "64b64c000000000000000002";
const inactive = "64b64c000000000000000003";

test("selects one and multiple categories without modifier-key behavior", () => {
  const one = toggleProductCategory([], active, true, "active");
  assert.deepEqual(one, [active]);
  assert.deepEqual(toggleProductCategory(one, second, true, "active"), [active, second]);
});

test("removes selected categories and safely normalizes duplicate existing IDs", () => {
  assert.deepEqual(toggleProductCategory([active, second], active, false, "active"), [second]);
  assert.deepEqual(normalizeProductCategoryIds([active, active, "", second]), [active, second]);
});

test("preserves existing inactive references unless explicitly removed and prevents new inactive assignments", () => {
  assert.deepEqual(toggleProductCategory([inactive], inactive, true, "inactive"), [inactive]);
  assert.deepEqual(toggleProductCategory([inactive], inactive, false, "inactive"), []);
  assert.deepEqual(toggleProductCategory([], inactive, true, "inactive"), []);
});
