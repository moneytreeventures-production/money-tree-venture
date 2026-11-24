import assert from "node:assert/strict";
import { Types } from "mongoose";
import { test } from "node:test";
import { canCommitCouponPreview, couponPreviewRequestSchema, priceCouponPreview } from "../../src/lib/coupons/preview-pricing";

const productA = new Types.ObjectId("64b64c000000000000000001");
const productB = new Types.ObjectId("64b64c000000000000000002");
const category = new Types.ObjectId("64b64c000000000000000010");
const percentCoupon = { discountType: "percentage" as const, discountValue: 1_000, minimumOrderPaise: 0, allowedProductIds: [], allowedCategoryIds: [] };

test("preview computes the coupon from canonical prices and recalculates after cart changes", () => {
  const products = [{ _id: productA, pricePaise: 2_000, categoryIds: [] }, { _id: productB, pricePaise: 3_000, categoryIds: [] }];
  const one = priceCouponPreview([{ productId: productA.toString(), quantity: 1 }], products, percentCoupon);
  assert.deepEqual(one, { subtotalPaise: 2_000, discountPaise: 200, payablePaise: 1_800 });
  const afterAdd = priceCouponPreview([{ productId: productA.toString(), quantity: 1 }, { productId: productB.toString(), quantity: 1 }], products, percentCoupon);
  assert.deepEqual(afterAdd, { subtotalPaise: 5_000, discountPaise: 500, payablePaise: 4_500 });
  const afterRemove = priceCouponPreview([{ productId: productB.toString(), quantity: 1 }], products, percentCoupon);
  assert.deepEqual(afterRemove, { subtotalPaise: 3_000, discountPaise: 300, payablePaise: 2_700 });
  const afterServerPriceChange = priceCouponPreview([{ productId: productB.toString(), quantity: 1 }], [{ ...products[1]!, pricePaise: 4_000 }], percentCoupon);
  assert.deepEqual(afterServerPriceChange, { subtotalPaise: 4_000, discountPaise: 400, payablePaise: 3_600 });
});

test("preview enforces minimums, product and category restrictions, and discount caps", () => {
  const products = [{ _id: productA, pricePaise: 5_000, categoryIds: [] }, { _id: productB, pricePaise: 7_000, categoryIds: [category] }];
  assert.throws(() => priceCouponPreview([{ productId: productA.toString(), quantity: 1 }], products, { ...percentCoupon, minimumOrderPaise: 5_001 }), /higher cart value/);
  assert.throws(() => priceCouponPreview([{ productId: productA.toString(), quantity: 1 }], products, { ...percentCoupon, allowedProductIds: [productB], allowedCategoryIds: [category] }), /does not apply/);
  assert.deepEqual(priceCouponPreview([{ productId: productB.toString(), quantity: 1 }], products, { ...percentCoupon, allowedCategoryIds: [category], maximumDiscountPaise: 250 }), { subtotalPaise: 7_000, discountPaise: 250, payablePaise: 6_750 });
  assert.throws(() => priceCouponPreview([{ productId: productA.toString(), quantity: 1 }], products, { ...percentCoupon, discountType: "fixed", discountValue: 9_000 }), /zero/);
});

test("preview rejects missing (including unpublished) products and never accepts browser prices", () => {
  assert.throws(() => priceCouponPreview([{ productId: productA.toString(), quantity: 1 }], [], percentCoupon), /no longer available/);
  const valid = { code: "SAVE10", items: [{ productId: productA.toString(), quantity: 2 }] };
  assert.equal(couponPreviewRequestSchema.safeParse(valid).success, true);
  assert.equal(couponPreviewRequestSchema.safeParse({ ...valid, subtotalPaise: 1 }).success, false);
  assert.equal(couponPreviewRequestSchema.safeParse({ ...valid, items: [{ productId: productA.toString(), quantity: 1, pricePaise: 1 }] }).success, false);
});

test("preview rejects multiple units of one Call Guidance booking", () => {
  assert.throws(() => priceCouponPreview(
    [{ productId: productA.toString(), quantity: 2 }],
    [{ _id: productA, pricePaise: 5_000, productType: "call_guidance", categoryIds: [] }],
    percentCoupon,
  ), /Only one 1:1 Call Guidance session/);
});

test("an aborted or out-of-date preview response cannot replace the latest cart quote", () => {
  const oldRequest = new AbortController();
  const newestRequest = new AbortController();
  oldRequest.abort();
  assert.equal(canCommitCouponPreview(oldRequest.signal, "cart-old", "cart-new"), false);
  assert.equal(canCommitCouponPreview(newestRequest.signal, "cart-old", "cart-new"), false);
  assert.equal(canCommitCouponPreview(newestRequest.signal, "cart-new", "cart-new"), true);
});
