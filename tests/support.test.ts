import assert from "node:assert/strict";
import { test } from "node:test";
import { supportRequestSchema, supportRateSchema, supportCategories } from "../src/lib/db/models/support";
test("support schema constrains category and has private admin indexes", () => {
  assert.ok(supportCategories.includes("grievance"));
  assert.deepEqual(supportRequestSchema.path("status").options.enum, ["new","in_progress","resolved","closed"]);
  assert.ok(supportRequestSchema.indexes().some(([keys]) => keys.status === 1));
  assert.ok(supportRateSchema.indexes().some(([, options]) => options.unique));
});
