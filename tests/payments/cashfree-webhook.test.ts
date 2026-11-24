import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { CASHFREE_WEBHOOK_MAX_BODY_BYTES, verifyCashfreeWebhookSignature } from "../../src/lib/payments/cashfree/webhook-service";
import { createCashfreeWebhookHandler } from "../../src/lib/payments/cashfree/route-handlers";

test("Cashfree signature verification covers the exact timestamp and raw body", () => {
  const rawBody = '{ "type":"PAYMENT_SUCCESS_WEBHOOK" }';
  const timestamp = "1794960000000";
  const secret = "server-only-webhook-secret";
  const signature = createHmac("sha256", secret).update(timestamp + rawBody, "utf8").digest("base64");
  assert.equal(verifyCashfreeWebhookSignature(rawBody, timestamp, signature, secret), true);
  assert.equal(verifyCashfreeWebhookSignature(rawBody.replace(" ", ""), timestamp, signature, secret), false);
  assert.equal(verifyCashfreeWebhookSignature(rawBody, timestamp, signature, "wrong-secret"), false);
});

test("webhook route passes the original body and Cashfree verification headers unchanged", async () => {
  let received: unknown;
  const handler = createCashfreeWebhookHandler(async (rawBody, headers) => {
    received = { rawBody, headers };
    return { accepted: true };
  });
  const body = '{"type":"PAYMENT_SUCCESS_WEBHOOK"}';
  const response = await handler(new Request("https://example.test/api/webhooks/cashfree", {
    method: "POST", headers: {
      "x-webhook-timestamp": "1794960000000", "x-webhook-signature": "signature", "x-idempotency-header": "event-1",
    }, body,
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(received, {
    rawBody: body,
    headers: { timestamp: "1794960000000", signature: "signature", idempotency: "event-1" },
  });
});

test("webhook route rejects oversized streaming bodies before invoking the processor", async () => {
  let processorCalled = false;
  let streamCancelled = false;
  const handler = createCashfreeWebhookHandler(async () => {
    processorCalled = true;
    return { accepted: true };
  });
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(CASHFREE_WEBHOOK_MAX_BODY_BYTES));
      controller.enqueue(new Uint8Array(1));
    },
    cancel() { streamCancelled = true; },
  });
  const init = { method: "POST", body, duplex: "half" } as RequestInit & { duplex: "half" };
  const response = await handler(new Request("https://example.test/api/webhooks/cashfree", init));

  assert.equal(response.status, 400);
  assert.equal(processorCalled, false);
  assert.equal(streamCancelled, true);
});

test("webhook route rejects an oversized declared body before reading it", async () => {
  let processorCalled = false;
  const handler = createCashfreeWebhookHandler(async () => {
    processorCalled = true;
    return { accepted: true };
  });
  const response = await handler(new Request("https://example.test/api/webhooks/cashfree", {
    method: "POST",
    headers: { "content-length": String(CASHFREE_WEBHOOK_MAX_BODY_BYTES + 1) },
    body: "{}",
  }));

  assert.equal(response.status, 400);
  assert.equal(processorCalled, false);
});
