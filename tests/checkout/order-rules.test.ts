import assert from "node:assert/strict";
import { test } from "node:test";
import { isOrderQuantityAllowed } from "../../src/lib/checkout/order-rules";
import { orderPaymentMessage } from "../../src/lib/checkout/order-presentation";
import { canExpireOrder } from "../../src/lib/checkout/order-lifecycle";

test("Call Guidance quantity matches its single-booking fulfillment", () => {
  assert.equal(isOrderQuantityAllowed("call_guidance", 1), true);
  assert.equal(isOrderQuantityAllowed("call_guidance", 2), false);
  assert.equal(isOrderQuantityAllowed("pdf", 10), false);
  assert.equal(isOrderQuantityAllowed("pdf_bundle", 0), false);
});

test("customer-facing order messages distinguish verified, pending, failed and expired states", () => {
  assert.match(orderPaymentMessage("paid", "paid", false), /Payment confirmed/);
  assert.match(orderPaymentMessage("awaiting_payment", "pending", false), /still processing/);
  assert.match(orderPaymentMessage("awaiting_payment", "failed", false), /confirming when a new checkout is safe/);
  assert.match(orderPaymentMessage("expired", "failed", true), /order has expired/);
  assert.match(orderPaymentMessage("awaiting_payment", "unknown", false), /being verified/);
});

test("order expiry waits for unresolved provider attempts and never expires paid orders", () => {
  const now = new Date("2026-11-21T12:00:00.000Z");
  const expiresAt = new Date(now.getTime() - 1);
  assert.equal(canExpireOrder({ orderStatus: "awaiting_payment", paymentStatus: "unpaid", expiresAt, hasPendingPaymentAttempt: false, now }), true);
  assert.equal(canExpireOrder({ orderStatus: "awaiting_payment", paymentStatus: "pending", expiresAt, hasPendingPaymentAttempt: false, now }), false);
  assert.equal(canExpireOrder({ orderStatus: "awaiting_payment", paymentStatus: "failed", expiresAt, hasPendingPaymentAttempt: true, now }), false);
  assert.equal(canExpireOrder({ orderStatus: "paid", paymentStatus: "paid", expiresAt, hasPendingPaymentAttempt: false, now }), false);
  assert.equal(canExpireOrder({ orderStatus: "awaiting_payment", paymentStatus: "unpaid", expiresAt: new Date(now.getTime() + 1), hasPendingPaymentAttempt: false, now }), false);
});
