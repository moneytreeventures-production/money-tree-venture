import assert from "node:assert/strict";
import { test } from "node:test";
import { buildBookingMessage, buildPurchaseConfirmation, buildRefundConfirmation, isTransactionalEmailEligible, outboxRetryDelayMs, transactionalRecipientAllowed } from "../../src/lib/email/outbox-service";

test("transactional recipients are restricted by stored payment environment", () => {
  const approved = { gatewayEnvironment: "sandbox", recipient: "owner@example.test", allowed: "owner@example.test" };
  assert.equal(transactionalRecipientAllowed(approved), true);
  assert.equal(transactionalRecipientAllowed({ ...approved, recipient: "buyer@example.test" }), false);
  assert.equal(transactionalRecipientAllowed({ ...approved, allowed: undefined }), false);
  assert.equal(transactionalRecipientAllowed({ ...approved, gatewayEnvironment: undefined }), false);
  assert.equal(transactionalRecipientAllowed({ gatewayEnvironment: "production", recipient: "buyer@example.test" }), true);
  assert.equal(transactionalRecipientAllowed({ gatewayEnvironment: "production", recipient: "invalid" }), false);
});
import { buildResendRequest, parseResendAcceptance } from "../../src/lib/email/resend";

import { createOutboxRouteHandler, localWorkerCutoffAllowed } from "../../src/lib/email/outbox-route-handler";

test("local worker cutoff requires explicit local database and enablement", () => {
  const valid = { enabled: "true", nodeEnv: "development", appUrl: "http://localhost:3000", database: "moneytreeventures", testDatabase: "moneytreeventures", role: "local-development-only" };
  assert.equal(localWorkerCutoffAllowed(valid), true);
  assert.equal(localWorkerCutoffAllowed({ ...valid, enabled: undefined }), false);
  assert.equal(localWorkerCutoffAllowed({ ...valid, database: "moneytreeventures_staging" }), false);
  assert.equal(localWorkerCutoffAllowed({ ...valid, nodeEnv: "production" }), false);
  assert.equal(localWorkerCutoffAllowed({ ...valid, netlify: "true" }), false);
});
import { buildOrderPurchaseConfirmationEvent } from "../../src/lib/fulfillment/purchase-confirmation-event";
import { Types } from "mongoose";

test("Resend acceptance requires a provider message ID and distinguishes safe failure categories", async () => {
  assert.equal(await parseResendAcceptance(Response.json({ id: "message_123" })), "message_123");
  await assert.rejects(parseResendAcceptance(Response.json({}, { status: 200 })), /RESEND_ACCEPTANCE_MISSING/);
  await assert.rejects(parseResendAcceptance(Response.json({ message: "private provider detail" }, { status: 401 })), /RESEND_AUTHENTICATION_REJECTED_401/);
  await assert.rejects(parseResendAcceptance(Response.json({}, { status: 429 })), /RESEND_RATE_LIMITED_429/);
});

test("purchase confirmation event is order-scoped and has a stable deduplication key", () => {
  const orderId = new Types.ObjectId("64b64c000000000000000101");
  const userId = new Types.ObjectId("64b64c000000000000000102");
  const order = { _id: orderId, userId, orderReference: "MTV-ORDER-1" };
  const first = buildOrderPurchaseConfirmationEvent(order, new Date("2026-01-01T00:00:00.000Z"));
  const retry = buildOrderPurchaseConfirmationEvent(order, new Date("2026-01-02T00:00:00.000Z"));
  assert.equal(first.eventType, "purchase_confirmation");
  assert.equal(first.aggregateType, "order");
  assert.equal(first.aggregateId, orderId);
  assert.equal(first.dedupeKey, "purchase-confirmation:64b64c000000000000000101");
  assert.equal(retry.dedupeKey, first.dedupeKey);
  assert.deepEqual(first.payload, { userId, orderId, orderReference: "MTV-ORDER-1" });
});

test("order confirmation lists order items in English and escapes customer data", () => {
  const purchase = buildPurchaseConfirmation({ name: "<script>Buyer</script>", orderReference: "MTV-123", dashboardUrl: "https://example.test/account", lines: [{ productName: "PDF One", quantity: 1, lineTotalPaise: 19900 }, { productName: "PDF Two", quantity: 2, lineTotalPaise: 39800 }], totalPaise: 59700 });
  assert.equal(purchase.html.includes("<script>"), false);
  assert.match(purchase.text, /PDF One x 1/);
  assert.match(purchase.text, /PDF Two x 2/);
  assert.match(purchase.text, /Payment for order MTV-123 is confirmed/);
  assert.match(purchase.text, /Total paid:.*597\.00/);
  assert.doesNotMatch(`${purchase.text}\n${purchase.html}`, /r2\.dev|r2\.cloudflarestorage|\/private\/|\.pdf\?/i);
  const scheduled = buildBookingMessage({ name: "Asha", reference: "MTVB-1", status: "scheduled", instructions: "Join using <link>", dashboardUrl: "https://example.test/account" });
  assert.match(scheduled.html, /&lt;link&gt;/);
  assert.match(scheduled.text, /not confirmed until our team confirms it/);
  assert.doesNotMatch(scheduled.text, /Namaste|Aapki|dekhein/);
  const confirmed = buildBookingMessage({ name: "Asha", reference: "MTVB-1", status: "confirmed", instructions: "", dashboardUrl: "https://example.test/account" });
  assert.match(confirmed.text, /appointment is confirmed/);
  assert.doesNotMatch(confirmed.text, /not confirmed/);
  const requested = buildBookingMessage({ name: "Asha", reference: "MTVB-1", status: "awaiting_scheduling", instructions: "", dashboardUrl: "https://example.test/account" });
  assert.match(requested.text, /requested time is not confirmed yet/);
});

test("Resend request uses the configured sender, recipient, content and idempotency without sending", () => {
  const request = buildResendRequest({ to: "owner@example.test", subject: "Test", text: "Plain text", html: "<p>HTML</p>" }, "phase18-test-key", "test-only-api-key", "MoneyTreeVentures <verified@example.test>");
  assert.equal(request.url, "https://api.resend.com/emails");
  assert.equal(request.init.method, "POST");
  const headers = new Headers(request.init.headers);
  assert.equal(headers.get("authorization"), "Bearer test-only-api-key");
  assert.equal(headers.get("idempotency-key"), "phase18-test-key");
  assert.deepEqual(JSON.parse(String(request.init.body)), { from: "MoneyTreeVentures <verified@example.test>", to: ["owner@example.test"], subject: "Test", text: "Plain text", html: "<p>HTML</p>" });
});

test("outbox retries use bounded exponential delay", () => {
  assert.equal(outboxRetryDelayMs(1), 30_000);
  assert.equal(outboxRetryDelayMs(2), 60_000);
  assert.equal(outboxRetryDelayMs(8), 60 * 60_000);
  assert.equal(outboxRetryDelayMs(12), 60 * 60_000);
});

test("refund notifications can report a cancelled booking while paid-only confirmations are suppressed", () => {
  assert.equal(isTransactionalEmailEligible({ eventType: "booking_status", orderStatus: "refunded", paymentStatus: "refunded", bookingStatus: "cancelled" }), true);
  assert.equal(isTransactionalEmailEligible({ eventType: "booking_confirmation", orderStatus: "refunded", paymentStatus: "refunded", bookingStatus: "cancelled" }), false);
  assert.equal(isTransactionalEmailEligible({ eventType: "purchase_confirmation", orderStatus: "refunded", paymentStatus: "refunded" }), false);
  assert.equal(isTransactionalEmailEligible({ eventType: "refund_confirmation", orderStatus: "refunded", paymentStatus: "refunded", refundStatus: "success" }), true);
  assert.equal(isTransactionalEmailEligible({ eventType: "refund_confirmation", orderStatus: "paid", paymentStatus: "paid", refundStatus: "success" }), false);
  assert.equal(isTransactionalEmailEligible({ eventType: "refund_confirmation", orderStatus: "refunded", paymentStatus: "refunded", refundStatus: "pending" }), false);
});

test("payment confirmation remains eligible while a verified refund is pending", () => {
  const pendingRefund = { orderStatus: "partially_refunded", paymentStatus: "partially_refunded" };
  assert.equal(isTransactionalEmailEligible({ eventType: "purchase_confirmation", ...pendingRefund }), true);
  assert.equal(isTransactionalEmailEligible({ eventType: "booking_confirmation", ...pendingRefund }), true);
  assert.equal(isTransactionalEmailEligible({ eventType: "purchase_confirmation", orderStatus: "refunded", paymentStatus: "refunded" }), false);
});

test("refund confirmation uses English, INR formatting, and escaped customer data", () => {
  const message = buildRefundConfirmation({ name: "<Buyer>", orderReference: "MTV-123", amountPaise: 125050, dashboardUrl: "https://example.test/account" });
  assert.equal(message.html.includes("<Buyer>"), false);
  assert.match(message.html, /&lt;Buyer&gt;/);
  assert.match(message.text, /1,250\.50/);
  assert.match(message.text, /credit may take some time to appear/);
  assert.doesNotMatch(message.text, /Namaste|Aapka|Cashfree ne/);
});

test("outbox endpoint rejects missing or incorrect worker credentials before processing", async () => {
  let called = false;
  const handler = createOutboxRouteHandler(async () => { called = true; return { sent: 1, retried: 0, deadLetter: 0 }; }, () => "server-secret-value-1234567890123456");
  const response = await handler(new Request("https://example.test/api/internal/outbox", { method: "POST", headers: { authorization: "Bearer wrong" } }));
  assert.equal(response.status, 401);
  assert.equal(called, false);
});

test("outbox endpoint validates a bounded batch and invokes the worker only after authorization", async () => {
  let receivedLimit = 0;
  const handler = createOutboxRouteHandler(async (limit) => { receivedLimit = limit ?? 10; return { sent: 2, retried: 0, deadLetter: 0 }; }, () => "server-secret-value-1234567890123456");
  const invalid = await handler(new Request("https://example.test/api/internal/outbox?limit=100", { method: "POST", headers: { authorization: "Bearer server-secret-value-1234567890123456" } }));
  assert.equal(invalid.status, 400);
  const valid = await handler(new Request("https://example.test/api/internal/outbox?limit=3", { method: "POST", headers: { authorization: "Bearer server-secret-value-1234567890123456" } }));
  assert.equal(valid.status, 200);
  assert.equal(receivedLimit, 3);
});

test("worker authorization requires the Bearer scheme", async () => {
  const handler = createOutboxRouteHandler(async () => ({ sent: 0, retried: 0, deadLetter: 0 }), () => "test-worker-secret");
  for (const header of ["test-worker-secret", "Basic test-worker-secret", "Bearer wrong-secret"]) {
    assert.equal((await handler(new Request("https://example.test/api/internal/outbox", { method: "POST", headers: { authorization: header } }))).status, 401);
  }
  assert.equal((await handler(new Request("https://example.test/api/internal/outbox", { method: "POST", headers: { authorization: "bearer test-worker-secret" } }))).status, 200);
});
