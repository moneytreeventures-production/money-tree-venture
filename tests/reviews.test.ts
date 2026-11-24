import assert from "node:assert/strict";
import { test } from "node:test";
import { reviewSchema } from "../src/lib/db/models/review";

test("review schema requires a rating, bounded text, and one customer-product index", () => {
  const rating = reviewSchema.path("rating");
  assert.ok(rating);
  assert.ok(reviewSchema.indexes().some(([fields, options]) => fields.customerId === 1 && fields.productId === 1 && options.unique));
  const reviews = reviewSchema.path("text");
  assert.ok(reviews);
  assert.deepEqual(reviewSchema.path("status").options.enum, ["pending", "approved", "rejected"]);
});

