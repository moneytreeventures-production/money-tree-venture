import assert from "node:assert/strict";
import { Types } from "mongoose";
import { test } from "node:test";
import { AuthenticationError, ConflictError, ValidationError } from "../../src/lib/errors/app-error";
import { createAdminRefundHandler } from "../../src/lib/payments/cashfree/refund-route-handler";
import { assertCashfreeRefundMatches, classifyCashfreeRefundStatus, requestFullCashfreeRefund, shouldRestorePaidOrderAfterRefundFailure, shouldStartNewFullRefundAttempt } from "../../src/lib/payments/cashfree/refund-service";
import type { User } from "../../src/lib/db/models/user";

const admin = {
  _id: new Types.ObjectId("64b64c000000000000000001"), authUserId: "auth-admin", name: "Admin",
  email: "admin@example.com", emailNormalized: "admin@example.com", role: "admin", status: "active",
} satisfies User;

test("full refund route denies unauthenticated admins before requesting a refund", async () => {
  let called = false;
  const handler = createAdminRefundHandler({
    authorize: async () => { throw new AuthenticationError(); },
    requestRefund: async () => { called = true; return {}; },
  });
  const response = await handler(new Request("https://example.test/api/admin/orders/order/refund", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reason: "Customer asked" }),
  }), { params: Promise.resolve({ id: "order" }) });
  assert.equal(response.status, 401);
  assert.equal(called, false);
});

test("authorized refund route forwards only the server-resolved admin ID and reason", async () => {
  let received: unknown;
  const handler = createAdminRefundHandler({
    authorize: async () => admin,
    requestRefund: async (orderId, adminId, input) => { received = { orderId, adminId, input }; return { status: "pending" }; },
  });
  const response = await handler(new Request("https://example.test/api/admin/orders/order-1/refund", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reason: "Customer request" }),
  }), { params: Promise.resolve({ id: "order-1" }) });
  assert.equal(response.status, 200);
  assert.deepEqual(received, { orderId: "order-1", adminId: admin._id.toString(), input: { reason: "Customer request" } });
});

test("full refund validation rejects malformed reason before database or gateway access", async () => {
  await assert.rejects(
    requestFullCashfreeRefund(new Types.ObjectId().toString(), admin._id!.toString(), { reason: "x" }, {
      async createOrder() { throw new Error("unused"); }, async fetchOrder() { throw new Error("unused"); },
      async fetchPayments() { throw new Error("unused"); }, async fetchPayment() { throw new Error("unused"); },
      async createRefund() { throw new Error("unused"); }, async fetchRefund() { throw new Error("unused"); },
    }),
    ValidationError,
  );
});

test("verified refund identity and exact amount must match the stored full-order request", () => {
  const record = { cashfreeOrderId: "cf-order", cashfreePaymentId: "cf-payment", refundId: "MTVR123", amountPaise: 2500 };
  const provider = { orderId: "cf-order", paymentId: "cf-payment", refundId: "MTVR123", providerRefundId: "cf-refund", amountPaise: 2500, currency: "INR" as const, status: "SUCCESS" };
  assert.doesNotThrow(() => assertCashfreeRefundMatches(record, provider));
  assert.throws(() => assertCashfreeRefundMatches(record, { ...provider, amountPaise: 2499 }), ConflictError);
  assert.throws(() => assertCashfreeRefundMatches(record, { ...provider, paymentId: "other-payment" }), ConflictError);
});

test("refund status mapping keeps nonterminal states pending and only success is fulfilment-final", () => {
  assert.equal(classifyCashfreeRefundStatus("SUCCESS"), "success");
  assert.equal(classifyCashfreeRefundStatus("PENDING_APPROVAL"), "pending");
  assert.equal(classifyCashfreeRefundStatus("ONHOLD"), "pending");
  assert.equal(classifyCashfreeRefundStatus("CANCELLED"), "failed");
  assert.equal(classifyCashfreeRefundStatus("REJECTED"), "failed");
  assert.equal(classifyCashfreeRefundStatus("FUTURE_PROVIDER_STATE"), "pending");
});

test("a new full refund attempt is allowed only when no attempt exists or the last one failed", () => {
  assert.equal(shouldStartNewFullRefundAttempt(undefined), true);
  assert.equal(shouldStartNewFullRefundAttempt("failed"), true);
  assert.equal(shouldStartNewFullRefundAttempt("processing"), false);
  assert.equal(shouldStartNewFullRefundAttempt("pending"), false);
  assert.equal(shouldStartNewFullRefundAttempt("success"), false);
});

test("a stale failed refund attempt cannot restore an order while a newer attempt is processing", () => {
  assert.equal(shouldRestorePaidOrderAfterRefundFailure("partially_refunded", "attempt-2", "attempt-2"), true);
  assert.equal(shouldRestorePaidOrderAfterRefundFailure("partially_refunded", "attempt-1", "attempt-2"), false);
  assert.equal(shouldRestorePaidOrderAfterRefundFailure("refunded", "attempt-2", "attempt-2"), false);
});
