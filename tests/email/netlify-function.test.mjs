import assert from "node:assert/strict";
import { test } from "node:test";
import processOutbox from "../../netlify/functions/process-outbox.mjs";
import expireOrders from "../../netlify/functions/expire-orders.mjs";
import { workerEndpoint } from "../../netlify/functions/worker-endpoint.mjs";

test("scheduled workers reject nonlocal HTTP and credentials before sending a secret", async () => {
  const originalUrl = process.env.APP_URL;
  const originalSecret = process.env.OUTBOX_WORKER_SECRET;
  const originalEnabled = process.env.ORDER_EXPIRATION_ENABLED;
  const originalFetch = globalThis.fetch;
  let calls = 0;
  process.env.APP_URL = "http://example.invalid";
  process.env.OUTBOX_WORKER_SECRET = "test-worker-secret";
  process.env.ORDER_EXPIRATION_ENABLED = "true";
  globalThis.fetch = async () => { calls++; throw new Error("Unexpected request"); };
  try {
    await assert.rejects(processOutbox, /HTTPS site origin/);
    await assert.rejects(expireOrders, /HTTPS site origin/);
    assert.equal(calls, 0);
    assert.throws(() => workerEndpoint("https://user:password@example.invalid", "/api/internal/outbox"), /HTTPS site origin/);
    assert.throws(() => workerEndpoint("https://example.invalid/path", "/api/internal/outbox"), /HTTPS site origin/);
    assert.throws(() => workerEndpoint("not-a-url", "/api/internal/outbox"), /valid site origin/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.APP_URL; else process.env.APP_URL = originalUrl;
    if (originalSecret === undefined) delete process.env.OUTBOX_WORKER_SECRET; else process.env.OUTBOX_WORKER_SECRET = originalSecret;
    if (originalEnabled === undefined) delete process.env.ORDER_EXPIRATION_ENABLED; else process.env.ORDER_EXPIRATION_ENABLED = originalEnabled;
  }
});

test("worker endpoint permits only local HTTP during development", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "development";
    assert.equal(workerEndpoint("http://localhost:3000", "/api/internal/outbox").href, "http://localhost:3000/api/internal/outbox");
    process.env.NODE_ENV = "production";
    assert.throws(() => workerEndpoint("http://localhost:3000", "/api/internal/outbox"), /HTTPS site origin/);
  } finally {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = originalNodeEnv;
  }
});

test("expiration schedule stays disabled by default and uses the protected endpoint when enabled", async () => {
  const originalUrl = process.env.APP_URL;
  const originalSecret = process.env.OUTBOX_WORKER_SECRET;
  const originalEnabled = process.env.ORDER_EXPIRATION_ENABLED;
  const originalReconciliationEnabled = process.env.PAYMENT_RECONCILIATION_ENABLED;
  const originalFetch = globalThis.fetch;
  const calls = [];
  process.env.APP_URL = "https://moneytreeventure.example";
  process.env.OUTBOX_WORKER_SECRET = "test-worker-secret";
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(null, { status: 200 });
  };
  try {
    delete process.env.ORDER_EXPIRATION_ENABLED;
    delete process.env.PAYMENT_RECONCILIATION_ENABLED;
    await expireOrders();
    assert.equal(calls.length, 0);
    process.env.PAYMENT_RECONCILIATION_ENABLED = "true";
    await expireOrders();
    assert.equal(calls.length, 1, "reconciliation alone starts the scheduled worker");
    delete process.env.PAYMENT_RECONCILIATION_ENABLED;
    process.env.ORDER_EXPIRATION_ENABLED = "true";
    await expireOrders();
    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, "https://moneytreeventure.example/api/internal/order-maintenance?limit=10");
    assert.equal(calls[0].init.method, "POST");
    assert.equal(calls[0].init.headers.authorization, "Bearer test-worker-secret");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.APP_URL; else process.env.APP_URL = originalUrl;
    if (originalSecret === undefined) delete process.env.OUTBOX_WORKER_SECRET; else process.env.OUTBOX_WORKER_SECRET = originalSecret;
    if (originalEnabled === undefined) delete process.env.ORDER_EXPIRATION_ENABLED; else process.env.ORDER_EXPIRATION_ENABLED = originalEnabled;
    if (originalReconciliationEnabled === undefined) delete process.env.PAYMENT_RECONCILIATION_ENABLED; else process.env.PAYMENT_RECONCILIATION_ENABLED = originalReconciliationEnabled;
  }
});

test("scheduled Netlify handler requires server-only worker configuration", async () => {
  const originalUrl = process.env.APP_URL;
  const originalSecret = process.env.OUTBOX_WORKER_SECRET;
  delete process.env.APP_URL;
  delete process.env.OUTBOX_WORKER_SECRET;
  await assert.rejects(processOutbox, /requires APP_URL and OUTBOX_WORKER_SECRET/);
  if (originalUrl !== undefined) process.env.APP_URL = originalUrl;
  if (originalSecret !== undefined) process.env.OUTBOX_WORKER_SECRET = originalSecret;
});

test("scheduled Netlify handler calls only the protected same-site outbox endpoint", async () => {
  const originalUrl = process.env.APP_URL;
  const originalSecret = process.env.OUTBOX_WORKER_SECRET;
  const originalFetch = globalThis.fetch;
  let received;
  process.env.APP_URL = "https://moneytreeventure.example";
  process.env.OUTBOX_WORKER_SECRET = "test-worker-secret";
  globalThis.fetch = async (url, init) => { received = { url: String(url), init }; return new Response(null, { status: 200 }); };
  try {
    await processOutbox();
    assert.equal(received.url, "https://moneytreeventure.example/api/internal/outbox?limit=25");
    assert.equal(received.init.method, "POST");
    assert.equal(received.init.headers.authorization, "Bearer test-worker-secret");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.APP_URL; else process.env.APP_URL = originalUrl;
    if (originalSecret === undefined) delete process.env.OUTBOX_WORKER_SECRET; else process.env.OUTBOX_WORKER_SECRET = originalSecret;
  }
});
