import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCatalogueApiQuery, readCatalogueQuery, updateCatalogueSearch } from "../../src/lib/catalog/catalogue-query";

test("reads and validates shareable catalogue filters and maps query text to the API", () => {
  const state = readCatalogueQuery("?q=%20freelance%20%20guide&category=ghar-se-kaam&productType=pdf&minPrice=99.50&maxPrice=500&sort=price_asc&page=2");
  assert.equal(state.query, "freelance guide");
  assert.equal(state.category, "ghar-se-kaam");
  assert.equal(state.productType, "pdf");
  assert.equal(state.page, 2);
  assert.equal(buildCatalogueApiQuery(state), "page=2&pageSize=12&sort=price_asc&search=freelance+guide&category=ghar-se-kaam&productType=pdf&minPrice=99.50&maxPrice=500");
});

test("ignores invalid query values and resets unsafe or out-of-range pages", () => {
  const state = readCatalogueQuery("?q=%20%20&category=BAD!&productType=video&sort=unknown&page=-4&minPrice=999&maxPrice=10");
  assert.equal(state.query, "");
  assert.equal(state.category, "");
  assert.equal(state.productType, "");
  assert.equal(state.sort, "featured");
  assert.equal(state.page, 1);
  assert.equal(state.invalidRange, true);
  assert.equal(state.minPrice, "");
  assert.equal(state.maxPrice, "");
});

test("filter changes reset pagination while preserving other valid URL state", () => {
  const updated = updateCatalogueSearch("?q=freelance&category=ghar-se-kaam&page=4&sort=price_asc", { category: "bundle" });
  assert.equal(updated, "q=freelance&category=bundle&sort=price_asc");
  const cleared = updateCatalogueSearch("?q=freelance&page=4", { query: "", category: "", productType: "", minPrice: "", maxPrice: "" });
  assert.equal(cleared, "");
});
