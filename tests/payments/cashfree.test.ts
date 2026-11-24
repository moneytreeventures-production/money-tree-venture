import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { cashfreeReturnUrlFromBase } from "../../src/lib/payments/cashfree/config";
import { parseServerEnv } from "../../src/lib/env/schema";
import { normalizeError } from "../../src/lib/errors/normalize";
import { IntegrationConfigurationError, ProviderCommunicationError } from "../../src/lib/errors/app-error";
import {
  CASHFREE_BASE_URLS,
  cashfreeWebhookUrlFromReturnUrl,
  resolveCashfreeConfiguration,
} from "../../src/lib/payments/cashfree/config";
import {
  createLazyCashfreeClient,
  createCashfreeClient,
} from "../../src/lib/payments/cashfree/client";

const baseEnv = {
  NODE_ENV: "test",
  CASHFREE_CLIENT_ID: "test-client-id",
  CASHFREE_CLIENT_SECRET: "test-client-secret",
  CASHFREE_ENVIRONMENT: "sandbox",
  CASHFREE_API_VERSION: "2026-01-01",
  CASHFREE_WEBHOOK_VERSION: "2025-01-01",
  CASHFREE_RETURN_URL_BASE: "http://localhost:3000/checkout/return",
};

test("Cashfree configuration is optional until the integration is requested", () => {
  assert.doesNotThrow(() => parseServerEnv({ NODE_ENV: "test" }));
  assert.throws(
    () => resolveCashfreeConfiguration(parseServerEnv({ NODE_ENV: "test" })),
    IntegrationConfigurationError,
  );
});

test("selects the correct sandbox and production base URLs", () => {
  const sandbox = resolveCashfreeConfiguration(parseServerEnv(baseEnv));
  assert.equal(sandbox.environment, "sandbox");
  assert.equal(sandbox.baseUrl, CASHFREE_BASE_URLS.sandbox);

  const production = resolveCashfreeConfiguration(parseServerEnv({
    ...baseEnv,
    NODE_ENV: "production",
    CASHFREE_ENVIRONMENT: "production",
    CASHFREE_RETURN_URL_BASE: "https://moneytreeventure.com/checkout/return",
    CASHFREE_CLIENT_ID: "production-client-id",
    CASHFREE_CLIENT_SECRET: "production-client-secret",
  }));
  assert.equal(production.environment, "production");
  assert.equal(production.baseUrl, CASHFREE_BASE_URLS.production);
  assert.equal(production.returnUrlBase.startsWith("https://"), true);
});

test("invalid environment, API version, and production HTTP return URL are rejected", () => {
  assert.throws(() => parseServerEnv({ ...baseEnv, CASHFREE_ENVIRONMENT: "live" }), /CASHFREE_ENVIRONMENT/);
  assert.throws(() => parseServerEnv({ ...baseEnv, CASHFREE_API_VERSION: "2026-13-01" }), /CASHFREE_API_VERSION/);
  assert.throws(() => resolveCashfreeConfiguration(parseServerEnv({
    ...baseEnv,
    NODE_ENV: "production",
    CASHFREE_ENVIRONMENT: "production",
    CASHFREE_RETURN_URL_BASE: "http://moneytreeventure.com/checkout/return",
  })), IntegrationConfigurationError);
  assert.throws(() => resolveCashfreeConfiguration(parseServerEnv({
    ...baseEnv,
    CASHFREE_RETURN_URL_BASE: "http://example.com/checkout/return",
  })), IntegrationConfigurationError);
});

test("Cashfree webhook callback is derived only from a public HTTPS return URL", () => {
  assert.equal(cashfreeWebhookUrlFromReturnUrl("https://shop.example/checkout/return"), "https://shop.example/api/webhooks/cashfree");
  assert.equal(cashfreeWebhookUrlFromReturnUrl("http://localhost:3000/checkout/return"), undefined);
  assert.equal(cashfreeWebhookUrlFromReturnUrl("not-a-url"), undefined);
});

test("configuration and client are lazy and reuse one server-side client", async () => {
  let configReads = 0;
  let fetchCount = 0;
  const getClient = createLazyCashfreeClient(() => {
    configReads += 1;
    return resolveCashfreeConfiguration(parseServerEnv(baseEnv));
  }, {
    fetcher: async () => {
      fetchCount += 1;
      return Response.json({ ok: true });
    },
  });

  assert.equal(configReads, 0);
  assert.equal(fetchCount, 0);
  const first = getClient();
  const second = getClient();
  assert.equal(first, second);
  assert.equal(configReads, 1);
  assert.equal(fetchCount, 0);
});

test("Cashfree request uses the selected environment/version and never exposes credentials", async () => {
  const config = resolveCashfreeConfiguration(parseServerEnv(baseEnv));
  let requestUrl = "";
  let requestHeaders = new Headers();
  const client = createCashfreeClient(config, {
    fetcher: async (input, init) => {
      requestUrl = String(input);
      requestHeaders = new Headers(init?.headers);
      return Response.json({ order_status: "ACTIVE" });
    },
  });

  const result = await client.request<{ order_status: string }>("/orders", "POST", { order_id: "test-order" });
  assert.equal(result.order_status, "ACTIVE");
  assert.equal(requestUrl, `${CASHFREE_BASE_URLS.sandbox}/orders`);
  assert.equal(requestHeaders.get("x-api-version"), "2026-01-01");
  assert.equal(requestHeaders.get("x-client-id"), "test-client-id");
  assert.equal(requestHeaders.get("x-client-secret"), "test-client-secret");
  assert.equal(JSON.stringify(client).includes("test-client-secret"), false);
  assert.equal(Object.keys(client).includes("#configuration"), false);
  await assert.rejects(client.request("https://attacker.example", "GET"), /Unsupported Cashfree API path/);
});

test("Cashfree return URL preserves configured parameters and replaces duplicate provider order IDs", () => {
  const url = new URL(cashfreeReturnUrlFromBase("https://shop.example/checkout/return?source=cashfree&order_id=old", "MTVP-new"));
  assert.equal(url.pathname, "/checkout/return");
  assert.equal(url.searchParams.get("source"), "cashfree");
  assert.deepEqual(url.searchParams.getAll("order_id"), ["MTVP-new"]);
  assert.equal(cashfreeReturnUrlFromBase("http://localhost:3000/checkout/return", "MTVP-123"), "http://localhost:3000/checkout/return?order_id=MTVP-123");
});

test("Cashfree requests use bounded timeouts and retain provider idempotency on create order", async () => {
  let requestInit: RequestInit | undefined;
  const client = createCashfreeClient(resolveCashfreeConfiguration(parseServerEnv(baseEnv)), {
    fetcher: async (_input, init) => { requestInit = init; return Response.json({ order_id: "MTVP-123", order_status: "ACTIVE", payment_session_id: "hidden" }); },
  });
  await client.createOrder({ orderId: "MTVP-123", idempotencyKey: "stable-key", amountPaise: 1500, currency: "INR",
    customer: { customerId: "id", name: "Name", email: "email", phone: "7123456789" },
    returnUrl: "http://localhost:3000/checkout/return?order_id=MTVP-123", expiresAt: new Date(Date.now() + 60000) });
  assert.ok(requestInit);
  assert.equal(new Headers(requestInit.headers).get("x-idempotency-key"), "stable-key");
  assert.ok(requestInit.signal instanceof AbortSignal);
  assert.equal(requestInit.signal.aborted, false);
});

test("Hosted Checkout order creation converts paise and sends its stable idempotency key", async () => {
  const config = resolveCashfreeConfiguration(parseServerEnv(baseEnv));
  let body: Record<string, unknown> = {};
  let headers = new Headers();
  const client = createCashfreeClient(config, {
    fetcher: async (_input, init) => {
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      headers = new Headers(init?.headers);
      return Response.json({ order_id: "MTVP-123", cf_order_id: "cf-1", order_status: "ACTIVE", order_amount: 12.34, order_currency: "INR", payment_session_id: "session-private" });
    },
  });
  const result = await client.createOrder({
    orderId: "MTVP-123", idempotencyKey: "12345678-1234-4234-8234-123456789012", amountPaise: 1234, currency: "INR",
    customer: { customerId: "user-1", name: "Buyer", email: "buyer@example.com", phone: "9876543210" },
    returnUrl: "http://localhost:3000/checkout/return?order_id=MTVP-123",
    notifyUrl: "https://shop.example/api/webhooks/cashfree",
    expiresAt: new Date("2026-01-01T00:30:00.000Z"),
  });
  assert.equal(body.order_amount, 12.34);
  assert.equal(body.order_currency, "INR");
  assert.deepEqual(body.order_meta, { return_url: "http://localhost:3000/checkout/return?order_id=MTVP-123", notify_url: "https://shop.example/api/webhooks/cashfree" });
  assert.equal(headers.get("x-idempotency-key"), "12345678-1234-4234-8234-123456789012");
  assert.equal(result.orderId, "MTVP-123");
  assert.equal(result.gatewayOrderId, "cf-1");
  assert.equal(result.amountPaise, 1234);
  assert.equal(result.paymentSessionId, "session-private");
});

test("Cashfree payment reads map rupees to safe integer paise", async () => {
  const client = createCashfreeClient(resolveCashfreeConfiguration(parseServerEnv(baseEnv)), {
    fetcher: async () => Response.json([{ order_id: "MTVP-123", cf_payment_id: "12345", payment_amount: 42.5, payment_currency: "INR", payment_status: "SUCCESS" }]),
  });
  const [payment] = await client.fetchPayments("MTVP-123");
  assert.deepEqual(payment, { orderId: "MTVP-123", paymentId: "12345", amountPaise: 4250, currency: "INR", status: "SUCCESS" });
});

test("Cashfree full refund uses a stable refund ID, idempotency key, and paise conversion", async () => {
  const config = resolveCashfreeConfiguration(parseServerEnv(baseEnv));
  const requests: Array<{ url: string; method: string; body?: Record<string, unknown>; headers: Headers }> = [];
  const client = createCashfreeClient(config, {
    fetcher: async (input, init) => {
      const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined;
      requests.push({ url: String(input), method: String(init?.method), body, headers: new Headers(init?.headers) });
      return Response.json({ order_id: "MTVP-123", cf_payment_id: "pay-1", cf_refund_id: "cf-refund-1", refund_id: "MTVR123", refund_amount: 12.34, refund_currency: "INR", refund_status: "PENDING", refund_arn: "arn-1" });
    },
  });
  const input = { orderId: "MTVP-123", refundId: "MTVR123", idempotencyKey: "12345678-1234-4234-8234-123456789012", amountPaise: 1234, reason: "Customer request" };
  const created = await client.createRefund(input);
  const fetched = await client.fetchRefund(input.orderId, input.refundId);
  assert.equal(requests[0].url, `${CASHFREE_BASE_URLS.sandbox}/orders/MTVP-123/refunds`);
  assert.equal(requests[0].method, "POST");
  assert.deepEqual(requests[0].body, { refund_amount: 12.34, refund_id: "MTVR123", refund_note: "Customer request", refund_speed: "STANDARD" });
  assert.equal(requests[0].headers.get("x-idempotency-key"), input.idempotencyKey);
  assert.equal(requests[1].url, `${CASHFREE_BASE_URLS.sandbox}/orders/MTVP-123/refunds/MTVR123`);
  assert.equal(created.amountPaise, 1234);
  assert.equal(fetched.providerRefundId, "cf-refund-1");
  assert.equal(fetched.arn, "arn-1");
});

test("gateway failures normalize safely without exposing raw response bodies or credentials", async () => {
  const config = resolveCashfreeConfiguration(parseServerEnv(baseEnv));
  const logged: Record<string, unknown>[] = [];
  const secret = "test-client-secret";
  const client = createCashfreeClient(config, {
    fetcher: async () => new Response(`private body ${secret}`, { status: 401 }),
    log: (fields) => logged.push({ ...fields }),
  });

  await assert.rejects(client.request("/orders", "GET"), (error: unknown) => {
    assert.ok(error instanceof ProviderCommunicationError);
    const normalized = normalizeError(error);
    assert.equal(normalized.code, "CASHFREE_PROVIDER_ERROR");
    assert.doesNotMatch(normalized.message, new RegExp(secret));
    return true;
  });
  assert.equal(JSON.stringify(logged).includes(secret), false);
  assert.deepEqual(logged[0], { provider: "cashfree", operation: "GET", statusCode: 401 });
});

test("importing Cashfree configuration has no fetch side effect and secrets are server-only", () => {
  const result = spawnSync(
    process.execPath,
    ["--conditions=react-server", "-e", "global.fetch = () => { throw new Error('unexpected request') }; require('./.test-build/src/lib/payments/cashfree/client.js')"],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  for (const path of ["src/lib/payments/cashfree/config.ts", "src/lib/payments/cashfree/client.ts"]) {
    assert.match(readFileSync(path, "utf8"), /^import ["']server-only["'];/);
  }
});
