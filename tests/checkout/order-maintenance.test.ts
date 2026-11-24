import { test } from "node:test";
import assert from "node:assert/strict";
import { retentionEligible } from "../../src/lib/checkout/order-maintenance";
const cutoff = new Date("2026-10-01");
const expired = { gatewayEnvironment: "sandbox", orderStatus: "expired", paymentStatus: "unpaid", updatedAt: new Date("2026-09-01") };
test("only terminal sandbox unpaid orders beyond retention qualify", () => {
  assert.equal(retentionEligible(expired, cutoff), true);
  assert.equal(retentionEligible({ ...expired, updatedAt: new Date("2026-11-01") }, cutoff), false);
  assert.equal(retentionEligible({ ...expired, updatedAt: undefined }, cutoff), false);
  assert.equal(retentionEligible({ ...expired, gatewayEnvironment: "production" }, cutoff), false);
});
for (const status of ["paid", "pending", "refunded", "partially_refunded"]) {
  test(`protects ${status} payments even on an old expired order`, () => {
    assert.equal(retentionEligible({ ...expired, paymentStatus: status }, cutoff), false);
  });
}
test("paid timestamp protects an inconsistent unpaid record", () => {
  assert.equal(retentionEligible({ ...expired, paidAt: new Date("2026-09-01") }, cutoff), false);
});
test("unfinalized abandoned orders never qualify", () => {
  assert.equal(retentionEligible({ ...expired, orderStatus: "awaiting_payment" }, cutoff), false);
});
