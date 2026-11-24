import assert from "node:assert/strict";
import { Types } from "mongoose";
import { test } from "node:test";
import { AuthenticationError, IntegrationConfigurationError, ValidationError } from "../../src/lib/errors/app-error";
import { createCashfreePaymentRouteHandlers } from "../../src/lib/payments/cashfree/route-handlers";
import { createCashfreePayment, createOrRecoverCashfreeOrder, isRefundLockedPaymentState } from "../../src/lib/payments/cashfree/payment-service";
import type { CashfreeCreateOrderInput, CashfreeOrderResult } from "../../src/lib/payments/cashfree/client";
import { canReusePendingPaymentAttempt, classifyVerifiedOrderPayment } from "../../src/lib/payments/cashfree/order-payment-state";
import { normalizeIndianMobilePhone } from "../../src/lib/payments/cashfree/mobile-phone";
import { paymentFailureMessage, PHONE_VALIDATION_MESSAGE } from "../../src/lib/payments/cashfree/payment-feedback";
import { PAYMENT_STATUS_RETRY_DELAYS_MS, shouldRetryPaymentStatus } from "../../src/lib/payments/cashfree/status-polling";
import type { User } from "../../src/lib/db/models/user";

const customer = {
  _id: new Types.ObjectId("64b64c000000000000000099"), authUserId: "auth-customer", name: "Buyer",
  email: "buyer@example.com", emailNormalized: "buyer@example.com", role: "customer", status: "active",
} satisfies User;

const checkoutInput: CashfreeCreateOrderInput = {
  orderId: "MTVP-stable", idempotencyKey: "stable-key", amountPaise: 19900, currency: "INR",
  customer: { customerId: "test-customer", name: "Buyer", email: "buyer@example.test", phone: "7123456789" },
  returnUrl: "http://localhost:3000/checkout/return?order_id=MTVP-stable",
  expiresAt: new Date("2026-12-01T00:00:00.000Z"),
};
const activeProviderOrder: CashfreeOrderResult = {
  orderId: checkoutInput.orderId, amountPaise: checkoutInput.amountPaise, currency: "INR",
  status: "ACTIVE", paymentSessionId: "test-session",
};

test("lost Create Order response recovers only the same verified provider order", async () => {
  const calls: string[] = [];
  const lostResponse = new Error("response lost");
  const result = await createOrRecoverCashfreeOrder({
    async createOrder(input) { calls.push(`POST:${input.orderId}:${input.idempotencyKey}`); throw lostResponse; },
    async fetchOrder(orderId) { calls.push(`GET:${orderId}`); return activeProviderOrder; },
  }, checkoutInput);
  assert.equal(result.paymentSessionId, "test-session");
  assert.deepEqual(calls, ["POST:MTVP-stable:stable-key", "GET:MTVP-stable"]);
});

test("failed provider lookup retains the original Create Order failure for a same-key retry", async () => {
  const lostResponse = new Error("response lost");
  await assert.rejects(createOrRecoverCashfreeOrder({
    async createOrder() { throw lostResponse; },
    async fetchOrder(orderId) { assert.equal(orderId, checkoutInput.orderId); throw new Error("provider unavailable"); },
  }, checkoutInput), (error: unknown) => error === lostResponse);
});

test("recovered provider order must match identity, amount, INR, active state and session", async () => {
  const invalid: CashfreeOrderResult[] = [
    { ...activeProviderOrder, orderId: "MTVP-other" },
    { ...activeProviderOrder, amountPaise: 19800 },
    { ...activeProviderOrder, currency: "USD" },
    { ...activeProviderOrder, status: "PAID" },
    { ...activeProviderOrder, paymentSessionId: undefined },
  ];
  for (const result of invalid) {
    await assert.rejects(createOrRecoverCashfreeOrder({
      async createOrder() { throw new Error("response lost"); },
      async fetchOrder() { return result; },
    }, checkoutInput), /checkout session is unavailable or does not match/);
  }
  await assert.rejects(createOrRecoverCashfreeOrder({
    async createOrder() { return { ...activeProviderOrder, amountPaise: 19800 }; },
    async fetchOrder() { throw new Error("must not fetch after a mismatched response"); },
  }, checkoutInput), /checkout session is unavailable or does not match/);
});

test("Indian mobile normalization agrees across client and server without number conversion", () => {
  assert.equal(normalizeIndianMobilePhone("7123456789"), "7123456789");
  assert.equal(normalizeIndianMobilePhone(" 71234 56789 "), "7123456789");
  assert.equal(normalizeIndianMobilePhone("71234-56789"), "7123456789");
  assert.equal(normalizeIndianMobilePhone("712345678"), null);
  assert.equal(normalizeIndianMobilePhone("71234567890"), null);
  assert.equal(normalizeIndianMobilePhone("5123456789"), null);
  assert.equal(normalizeIndianMobilePhone(7123456789), null);
  assert.deepEqual(JSON.parse(JSON.stringify({ phone: normalizeIndianMobilePhone(" 71234 56789 ") })), { phone: "7123456789" });
});

test("payment feedback distinguishes phone validation from other API failures", () => {
  assert.equal(paymentFailureMessage({ code: "VALIDATION_ERROR", details: [{ field: "phone" }] }), PHONE_VALIDATION_MESSAGE);
  assert.notEqual(paymentFailureMessage({ code: "VALIDATION_ERROR", details: [{ field: "order" }] }), PHONE_VALIDATION_MESSAGE);
  assert.notEqual(paymentFailureMessage({ code: "CASHFREE_CONFIGURATION_ERROR" }), PHONE_VALIDATION_MESSAGE);
  assert.notEqual(paymentFailureMessage({ code: "CASHFREE_PROVIDER_ERROR" }), PHONE_VALIDATION_MESSAGE);
});

test("payment API retains distinct safe codes and fields for phone and configuration errors", async () => {
  for (const [failure, expectedCode, expectedField] of [
    [new ValidationError([{ field: "phone", message: PHONE_VALIDATION_MESSAGE }]), "VALIDATION_ERROR", "phone"],
    [new IntegrationConfigurationError("Cashfree", ["CASHFREE_RETURN_URL_BASE"]), "CASHFREE_CONFIGURATION_ERROR", "CASHFREE_RETURN_URL_BASE"],
  ] as const) {
    const handlers = createCashfreePaymentRouteHandlers({ authorize: async () => customer, createPayment: async () => { throw failure; } });
    const response = await handlers.create(new Request("https://example.test/api/orders/order-id/payments", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ phone: "7123456789" }),
    }), { params: Promise.resolve({ id: "order-id" }) });
    const body = await response.json() as { error: { code: string; details?: Array<{ field: string }> } };
    assert.equal(response.status, failure.statusCode);
    assert.equal(body.error.code, expectedCode);
    assert.equal(body.error.details?.[0]?.field, expectedField);
  }
});

test("refund states lock payment callbacks from changing order fulfillment", () => {
  assert.equal(isRefundLockedPaymentState("partially_refunded", "pending"), true);
  assert.equal(isRefundLockedPaymentState("refunded", "paid"), true);
  assert.equal(isRefundLockedPaymentState("paid", "refunded"), true);
  assert.equal(isRefundLockedPaymentState("awaiting_payment", "pending"), false);
});

test("verified payment outcomes preserve paid orders and classify late success for review", () => {
  const now = new Date("2026-11-21T12:00:00.000Z");
  assert.equal(classifyVerifiedOrderPayment({ orderStatus: "awaiting_payment", paymentStatus: "unpaid", providerStatus: "SUCCESS", now }), "first_success");
  assert.equal(classifyVerifiedOrderPayment({ orderStatus: "expired", paymentStatus: "failed", providerStatus: "SUCCESS", now }), "late_success");
  assert.equal(classifyVerifiedOrderPayment({ orderStatus: "awaiting_payment", paymentStatus: "pending", providerStatus: "SUCCESS", expiresAt: new Date(now.getTime() - 1), now }), "late_success");
  assert.equal(classifyVerifiedOrderPayment({ orderStatus: "paid", paymentStatus: "paid", providerStatus: "SUCCESS", now }), "duplicate_success");
  assert.equal(classifyVerifiedOrderPayment({ orderStatus: "paid", paymentStatus: "paid", providerStatus: "FAILED", now }), "preserve_paid");
  assert.equal(classifyVerifiedOrderPayment({ orderStatus: "awaiting_payment", paymentStatus: "pending", providerStatus: "PENDING", now }), "pending");
  assert.equal(classifyVerifiedOrderPayment({ orderStatus: "awaiting_payment", paymentStatus: "pending", providerStatus: "UNKNOWN", now }), "unknown");
  assert.equal(classifyVerifiedOrderPayment({ orderStatus: "refunded", paymentStatus: "refunded", providerStatus: "SUCCESS", now }), "refund_locked");
});

test("payment status polling is bounded and stops after a terminal status", () => {
  assert.equal(PAYMENT_STATUS_RETRY_DELAYS_MS.length, 3);
  assert.ok(PAYMENT_STATUS_RETRY_DELAYS_MS.every((delay, index, delays) => index === 0 || delay > delays[index - 1]!));
  assert.equal(shouldRetryPaymentStatus("pending"), true);
  assert.equal(shouldRetryPaymentStatus("unknown"), true);
  assert.equal(shouldRetryPaymentStatus("paid"), false);
  assert.equal(shouldRetryPaymentStatus("failed"), false);
});

test("new client retries reuse only the same unresolved payment request", () => {
  assert.equal(canReusePendingPaymentAttempt({ status: "pending", storedRequestHash: "same", requestedHash: "same" }), true);
  assert.equal(canReusePendingPaymentAttempt({ status: "pending", storedRequestHash: "old", requestedHash: "new" }), false);
  assert.equal(canReusePendingPaymentAttempt({ status: "failed", storedRequestHash: "same", requestedHash: "same" }), false);
});

test("payment initiation requires an authenticated customer", async () => {
  let called = false;
  const handlers = createCashfreePaymentRouteHandlers({
    authorize: async () => { throw new AuthenticationError(); },
    createPayment: async () => { called = true; return { paymentSessionId: "", paymentReference: "", expiresAt: new Date(), environment: "sandbox" }; },
  });
  const response = await handlers.create(new Request("https://example.test/api/orders/order/payments", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ phone: "9876543210" }),
  }), { params: Promise.resolve({ id: "order" }) });
  assert.equal(response.status, 401);
  assert.equal(called, false);
});

test("payment initiation passes only the owner profile and request idempotency key", async () => {
  let received: unknown;
  const handlers = createCashfreePaymentRouteHandlers({
    authorize: async () => customer,
    createPayment: async (orderId, userId, input, key) => { received = { orderId, userId, input, key }; return { paymentSessionId: "session", paymentReference: "payment-reference", expiresAt: new Date("2026-01-01"), environment: "sandbox" }; },
  });
  const response = await handlers.create(new Request("https://example.test/api/orders/order-id/payments", {
    method: "POST", headers: { "content-type": "application/json", "idempotency-key": "abcdefghijklmnop" },
    body: JSON.stringify({ phone: "9876543210" }),
  }), { params: Promise.resolve({ id: "order-id" }) });
  assert.equal(response.status, 201);
  assert.deepEqual(received, {
    orderId: "order-id", userId: customer._id?.toString(), input: { phone: "9876543210" }, key: "abcdefghijklmnop",
  });
});

test("payment status lookup requires an authenticated customer and scopes the order to that profile", async () => {
  let called = false;
  const denied = createCashfreePaymentRouteHandlers({
    authorize: async () => { throw new AuthenticationError(); },
    getStatus: async () => { called = true; throw new Error("must not call status service"); },
  });
  const deniedResponse = await denied.status(new Request("https://example.test/api/orders/order-id/payments/status"), { params: Promise.resolve({ id: "order-id" }) });
  assert.equal(deniedResponse.status, 401);
  assert.equal(called, false);

  let received: unknown;
  const allowed = createCashfreePaymentRouteHandlers({
    authorize: async () => customer,
    getStatus: async (orderId, userId) => {
      received = { orderId, userId };
      return { orderReference: "MTV-1", subtotalPaise: 100, discountPaise: 0, taxPaise: 0, totalPaise: 100,
        currency: "INR", lines: [], orderStatus: "awaiting_payment", paymentStatus: "pending", paymentExpired: false };
    },
  });
  const response = await allowed.status(new Request("https://example.test/api/orders/order-id/payments/status"), { params: Promise.resolve({ id: "order-id" }) });
  assert.equal(response.status, 200);
  assert.deepEqual(received, { orderId: "order-id", userId: customer._id?.toString() });
});

test("malformed payment contact data is rejected before connecting to payment infrastructure", async () => {
  await assert.rejects(
    createCashfreePayment(new Types.ObjectId().toString(), customer._id!.toString(), { phone: "not-a-phone" }, "abcdefghijklmnop", {
      async createOrder() { throw new Error("must not call provider"); },
      async fetchOrder() { throw new Error("unused"); },
      async fetchPayments() { throw new Error("unused"); },
      async fetchPayment() { throw new Error("unused"); },
      async createRefund() { throw new Error("unused"); },
      async fetchRefund() { throw new Error("unused"); },
    }),
    /Please check the information you entered/,
  );
});
