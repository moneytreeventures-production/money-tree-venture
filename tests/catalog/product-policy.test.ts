import assert from "node:assert/strict";
import { test } from "node:test";
import { assertProductStatusTransition, buildPublicProductFilter } from "../../src/lib/catalog/product-policy";

test("allows draft publish/archive and published archive transitions", () => {
  assert.doesNotThrow(() => assertProductStatusTransition("draft", "published"));
  assert.doesNotThrow(() => assertProductStatusTransition("draft", "archived"));
  assert.doesNotThrow(() => assertProductStatusTransition("published", "archived"));
  assert.doesNotThrow(() => assertProductStatusTransition("published", "published"));
});

test("allows unpublishing and prevents reactivating archived products", () => {
  assert.doesNotThrow(() => assertProductStatusTransition("published", "draft"));
  assert.throws(() => assertProductStatusTransition("archived", "draft"), { code: "CONFLICT" });
  assert.throws(() => assertProductStatusTransition("archived", "published"), { code: "CONFLICT" });
});

test("public product filters expose published products only", () => {
  assert.deepEqual(buildPublicProductFilter(), { publicationStatus: "published" });
  assert.deepEqual(buildPublicProductFilter("64b64c000000000000000001"), {
    publicationStatus: "published",
    categoryIds: "64b64c000000000000000001",
  });
});
