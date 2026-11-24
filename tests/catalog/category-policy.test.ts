
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assertCategoryCanBeDeactivated,
  assertCategoryStatusTransition,
  buildPublicCategoryFilter,
} from "../../src/lib/catalog/category-policy";

test("allows normal category status transitions", () => {
  assert.doesNotThrow(() =>
    assertCategoryStatusTransition("active", "inactive"),
  );

  assert.doesNotThrow(() =>
    assertCategoryStatusTransition("inactive", "active"),
  );

  assert.doesNotThrow(() =>
    assertCategoryStatusTransition("inactive", "archived"),
  );
});

test("does not allow an archived category to be reactivated", () => {
  assert.throws(
    () => assertCategoryStatusTransition("archived", "active"),
    { code: "CONFLICT" },
  );

  assert.throws(
    () => assertCategoryStatusTransition("archived", "inactive"),
    { code: "CONFLICT" },
  );
});

test("allows deactivation when no published products use the category", () => {
  assert.doesNotThrow(() => assertCategoryCanBeDeactivated(0));
});

test("blocks deactivation when published products use the category", () => {
  assert.throws(
    () => assertCategoryCanBeDeactivated(1),
    { code: "CONFLICT" },
  );

  assert.throws(
    () => assertCategoryCanBeDeactivated(25),
    { code: "CONFLICT" },
  );
});

test("rejects invalid published product counts", () => {
  assert.throws(() => assertCategoryCanBeDeactivated(-1));
  assert.throws(() => assertCategoryCanBeDeactivated(1.5));
  assert.throws(() => assertCategoryCanBeDeactivated(Number.NaN));
});

test("public category filter includes active categories only", () => {
  assert.deepEqual(buildPublicCategoryFilter(), {
    status: "active",
  });
});
