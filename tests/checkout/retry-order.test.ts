import assert from "node:assert/strict";
import { test } from "node:test";
import { canRetryExpiredOrder, retryOrderProductIds } from "../../src/lib/checkout/retry-order";

test("only a conclusively expired failed order permits deliberate new checkout", () => {
  assert.equal(canRetryExpiredOrder({ orderStatus: "expired", paymentStatus: "failed" }), true);
  for (const [orderStatus, paymentStatus] of [["awaiting_payment", "pending"], ["awaiting_payment", "failed"], ["paid", "paid"], ["expired", "pending"]]) {
    assert.equal(canRetryExpiredOrder({ orderStatus, paymentStatus }), false);
  }
});

test("retry restores only distinct public product IDs, never stored prices", () => {
  const first = "6b0341108ffd602387cde276";
  const second = "6b0341108ffd602387cde277";
  assert.deepEqual(retryOrderProductIds([{ productId: first }, { productId: second }]), [first, second]);
  assert.equal(retryOrderProductIds([{ productId: first }, { productId: first }]), null);
  assert.equal(retryOrderProductIds([{ productId: "invalid" }]), null);
  assert.equal(retryOrderProductIds([]), null);
});
