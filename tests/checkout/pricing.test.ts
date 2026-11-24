import assert from "node:assert/strict";
import { test } from "node:test";
import { priceOrder } from "../../src/lib/checkout/pricing";

test("extracts tax inclusively from the post-discount gross in integer paise", () => {
  const [line] = priceOrder([{ lineSubtotalPaise: 11_800, discountEligible: true }], undefined, 1_800);
  assert.equal(line?.taxPaise, 1_800);
  assert.equal(line?.lineTotalPaise, 11_800);
});

test("allocates fixed discounts deterministically only to eligible lines", () => {
  const lines = priceOrder([
    { lineSubtotalPaise: 1_000, discountEligible: true },
    { lineSubtotalPaise: 2_000, discountEligible: false },
    { lineSubtotalPaise: 1_000, discountEligible: true },
  ], { type: "fixed", value: 1_500 }, 0);
  assert.deepEqual(lines.map((line) => line.discountPaise), [1_000, 0, 500]);
});

test("caps percentage coupons and rejects invalid tax configuration", () => {
  const [line] = priceOrder([{ lineSubtotalPaise: 10_000, discountEligible: true }], { type: "percentage", value: 5_000, maximumDiscountPaise: 2_000 }, 0);
  assert.equal(line?.discountPaise, 2_000);
  assert.throws(() => priceOrder([{ lineSubtotalPaise: 100, discountEligible: true }], undefined, -1));
});
