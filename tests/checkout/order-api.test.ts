import assert from "node:assert/strict";
import { Types } from "mongoose";
import { test } from "node:test";
import { ApplicationError, AuthenticationError } from "../../src/lib/errors/app-error";
import { checkoutOrderErrorMessage } from "../../src/lib/checkout/order-error";
import { createOrderRouteHandlers } from "../../src/lib/checkout/order-route-handlers";
import { assertRepurchaseAcknowledgement, createOrder, orderHistoryFilter, toCustomerOrderView, validateCheckout } from "../../src/lib/checkout/order-service";
import { orderStatusLabel } from "../../src/lib/checkout/order-presentation";
import { assertMutationOrigin, isTrustedMutationOrigin } from "../../src/lib/http/mutation-origin";
import type { User } from "../../src/lib/db/models/user";

const customer = {
  _id: new Types.ObjectId("64b64c000000000000000099"),
  authUserId: "trusted-auth-id", name: "Customer", email: "buyer@example.com", emailNormalized: "buyer@example.com",
  role: "customer", status: "active",
} satisfies User;

test("authenticated mutations reject cross-site origins and cookie requests without browser provenance", () => {
  const target = "https://example.test/api/orders";
  assert.throws(() => assertMutationOrigin(new Request(target, { method: "POST", headers: { origin: "https://attacker.test" } })), /this site/i);
  assert.throws(() => assertMutationOrigin(new Request(target, { method: "POST", headers: { "sec-fetch-site": "cross-site" } })), /this site/i);
  assert.throws(() => assertMutationOrigin(new Request(target, { method: "POST", headers: { cookie: "session=placeholder" } })), /this site/i);
  assert.doesNotThrow(() => assertMutationOrigin(new Request(target, { method: "POST", headers: { origin: "https://example.test", cookie: "session=placeholder" } }), "https://example.test"));
  assert.throws(() => assertMutationOrigin(new Request(target, { method: "POST", headers: { origin: "https://example.test", cookie: "session=placeholder" } }), "https://trusted.test"), /this site/i);
  assert.throws(() => assertMutationOrigin(new Request(target, { method: "POST", headers: { "sec-fetch-site": "same-site", cookie: "session=placeholder" } }), "https://example.test"), /this site/i);
  assert.equal(isTrustedMutationOrigin(new Request("https://forged.test/api/orders", { method: "POST", headers: { origin: "https://example.test" } }), "https://example.test"), true);
  assert.equal(isTrustedMutationOrigin(new Request("https://forged.test/api/orders", { method: "POST", headers: { origin: "https://forged.test" } }), "https://example.test"), false);
});

test("order history filters retain closed orders and scope archive to the customer", () => {
  const userId = new Types.ObjectId();
  assert.deepEqual(orderHistoryFilter(userId, "all"), { userId, archivedAt: { $exists: false } });
  assert.deepEqual(orderHistoryFilter(userId, "archived"), { userId, archivedAt: { $exists: true } });
  assert.deepEqual(orderHistoryFilter(userId, "completed"), { userId, archivedAt: { $exists: false }, orderStatus: "paid", paymentStatus: "paid" });
  assert.deepEqual(orderHistoryFilter(userId, "closed"), { userId, archivedAt: { $exists: false }, paymentStatus: { $ne: "pending" }, $or: [
    { orderStatus: { $in: ["expired", "cancelled", "refunded"] } },
    { paymentStatus: { $in: ["failed", "refunded"] } },
  ] });
  assert.equal(orderStatusLabel({ orderStatus: "expired", paymentStatus: "unpaid" }), "Expired");
  assert.equal(orderStatusLabel({ orderStatus: "refunded", paymentStatus: "refunded" }), "Refunded");
  assert.equal(orderStatusLabel({ orderStatus: "paid", paymentStatus: "paid" }), "Completed");
  assert.equal(orderStatusLabel({ orderStatus: "awaiting_payment", paymentStatus: "pending" }), "Processing payment");
});

test("archive endpoint requires authentication, validates input and passes the authenticated customer ID", async () => {
  const id = new Types.ObjectId().toString();
  let received: unknown;
  const request = (body: unknown) => new Request(`https://example.test/api/orders/${id}/archive`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const context = { params: Promise.resolve({ id }) };
  const denied = createOrderRouteHandlers({ authorize: async () => { throw new AuthenticationError(); }, services: { async setCustomerOrderArchived() { throw new Error("must not run"); } } });
  assert.equal((await denied.archivePATCH(request({ archived: true }), context)).status, 401);
  const allowed = createOrderRouteHandlers({ authorize: async () => customer, services: { async setCustomerOrderArchived(orderId, customerId, archived) { received = { orderId, customerId, archived }; return { archived }; } } });
  assert.equal((await allowed.archivePATCH(request({ archived: "yes" }), context)).status, 400);
  assert.equal((await allowed.archivePATCH(request({ archived: true }), context)).status, 200);
  assert.deepEqual(received, { orderId: id, customerId: customer._id.toString(), archived: true });
  assert.equal((await allowed.archivePATCH(request({ archived: false }), context)).status, 200);
  assert.deepEqual(received, { orderId: id, customerId: customer._id.toString(), archived: false });
});

test("checkout feedback distinguishes stale retries, coupon changes, missing products and temporary conflicts", () => {
  assert.match(checkoutOrderErrorMessage({ code: "ORDER_RETRY_MISMATCH" }), /cart changed/i);
  assert.match(checkoutOrderErrorMessage({ code: "VALIDATION_ERROR", details: [{ field: "couponCode" }] }), /coupon no longer applies/i);
  assert.match(checkoutOrderErrorMessage({ code: "NOT_FOUND" }), /no longer available/i);
  assert.match(checkoutOrderErrorMessage({ code: "ORDER_CREATE_COLLISION" }), /checkout update/i);
  assert.match(checkoutOrderErrorMessage({ code: "CONFLICT" }), /already be processing/i);
});

test("checkout request accepts one, two and three distinct product IDs without browser prices", () => {
  for (const count of [1, 2, 3]) {
    const items = Array.from({ length: count }, (_, index) => ({ productId: `64b64c00000000000000000${index + 1}`, quantity: 1 }));
    assert.deepEqual(validateCheckout({ items }).items, items);
  }
});

test("repurchase confirmation matches authenticated owned products in a mixed cart", () => {
  const first = "64b64c000000000000000001";
  const second = "64b64c000000000000000002";
  const third = "64b64c000000000000000003";
  const items = [{ productId: first, quantity: 1 }, { productId: second, quantity: 1 }, { productId: third, quantity: 1 }];
  assert.doesNotThrow(() => assertRepurchaseAcknowledgement(items, [], []));
  assert.throws(() => assertRepurchaseAcknowledgement(items, [second], []), (error: unknown) => error instanceof ApplicationError && error.code === "REPURCHASE_CONFIRMATION_REQUIRED" && error.details?.[0]?.field === "items.1.productId");
  assert.doesNotThrow(() => assertRepurchaseAcknowledgement(items, [second], [second]));
  assert.throws(() => assertRepurchaseAcknowledgement(items, [second], [first]), (error: unknown) => error instanceof ApplicationError && error.code === "REPURCHASE_CONFIRMATION_REQUIRED");
  assert.throws(() => assertRepurchaseAcknowledgement(items, [], [second]), (error: unknown) => error instanceof ApplicationError && error.code === "REPURCHASE_CONFIRMATION_STALE");
  assert.deepEqual(validateCheckout({ items, repurchaseProductIds: [second] }).repurchaseProductIds, [second]);
});

test("ownership preview route requires a customer and forwards only their authenticated ID", async () => {
  let received: unknown;
  const handlers = createOrderRouteHandlers({ authorize: async () => customer, services: { async previewCheckoutOwnership(input, userId) { received = { input, userId }; return { products: [], ownedProductIds: [] }; } } });
  const input = { items: [{ productId: "64b64c000000000000000001", quantity: 1 }] };
  const response = await handlers.ownershipPOST(new Request("https://example.test/api/orders/ownership", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(received, { input, userId: customer._id?.toString() });
});

test("order route forwards one, two or three distinct items in one creation call", async () => {
  for (const count of [1, 2, 3]) {
    let calls = 0;
    const items = Array.from({ length: count }, (_, index) => ({ productId: `64b64c00000000000000000${index + 1}`, quantity: 1 }));
    const handlers = createOrderRouteHandlers({
      authorize: async () => customer,
      services: { async createOrder(input) {
        calls += 1;
        return { id: "64b64c000000000000000099", lines: validateCheckout(input).items };
      } },
    });
    const response = await handlers.collectionPOST(new Request("https://example.test/api/orders", {
      method: "POST", headers: { "content-type": "application/json", "idempotency-key": "abcdefghijklmnop" },
      body: JSON.stringify({ items }),
    }));
    const body = await response.json() as { data: { lines: typeof items } };
    assert.equal(response.status, 201);
    assert.equal(calls, 1);
    assert.deepEqual(body.data.lines, items);
  }
});

test("checkout request rejects duplicate, multi-license, empty and malformed carts with distinct codes", () => {
  const id = "64b64c000000000000000001";
  const cases: Array<{ items: unknown; code: string }> = [
    { items: [{ productId: id, quantity: 1 }, { productId: id.toUpperCase(), quantity: 1 }], code: "CART_DUPLICATE_ITEM" },
    { items: [{ productId: id, quantity: 2 }], code: "CART_QUANTITY_INVALID" },
    { items: [], code: "CART_EMPTY" },
    { items: [{ productId: "invalid", quantity: 1 }], code: "CART_INVALID_ITEMS" },
    { items: [{ productId: id, quantity: 1, pricePaise: 1 }], code: "CART_INVALID_ITEMS" },
  ];
  for (const { items, code } of cases) assert.throws(() => validateCheckout({ items }), (error: unknown) => error instanceof ApplicationError && error.code === code);
});

test("order API returns a specific English cart error without creating an order", async () => {
  const handlers = createOrderRouteHandlers({ authorize: async () => customer });
  const response = await handlers.collectionPOST(new Request("https://example.test/api/orders", {
    method: "POST", headers: { "content-type": "application/json", "idempotency-key": "abcdefghijklmnop" },
    body: JSON.stringify({ items: [{ productId: "64b64c000000000000000001", quantity: 2 }] }),
  }));
  const body = await response.json() as { error: { code: string; message: string; details: Array<{ field: string; message: string }> } };
  assert.equal(response.status, 400);
  assert.equal(body.error.code, "CART_QUANTITY_INVALID");
  assert.match(body.error.message, /one license/i);
  assert.deepEqual(body.error.details, [{ field: "items.0.quantity", message: "This field is invalid." }]);
});

test("owned products and active checkouts give actionable English feedback", () => {
  assert.match(checkoutOrderErrorMessage({ code: "ALREADY_PURCHASED" }), /My Library/);
  assert.match(checkoutOrderErrorMessage({ code: "REPURCHASE_CONFIRMATION_REQUIRED" }), /confirm Purchase Again/i);
  assert.match(checkoutOrderErrorMessage({ code: "ACTIVE_CHECKOUT" }), /payment.*processed|payment.*processing/i);
  assert.match(checkoutOrderErrorMessage({ code: "CART_DUPLICATE_ITEM" }), /only once/i);
  assert.match(checkoutOrderErrorMessage({ code: "CART_QUANTITY_INVALID" }), /one license/i);
  assert.match(checkoutOrderErrorMessage({ code: "CART_INVALID_ITEMS" }), /invalid items/i);
});

test("order API preserves a distinct retry conflict code for the customer", async () => {
  const handlers = createOrderRouteHandlers({
    authorize: async () => customer,
    services: { createOrder: async () => { throw new ApplicationError("This checkout attempt belongs to a different cart.", { code: "ORDER_RETRY_MISMATCH", statusCode: 409 }); } },
  });
  const response = await handlers.collectionPOST(new Request("https://example.test/api/orders", {
    method: "POST", headers: { "content-type": "application/json", "idempotency-key": "abcdefghijklmnop" },
    body: JSON.stringify({ items: [{ productId: "64b64c000000000000000001", quantity: 1 }] }),
  }));
  const body = await response.json() as { error: { code: string; message: string } };
  assert.equal(response.status, 409);
  assert.equal(body.error.code, "ORDER_RETRY_MISMATCH");
  assert.doesNotMatch(body.error.message, /Mongo|hash|key/i);
});

test("order service rejects invalid cart data before touching database infrastructure", async () => {
  await assert.rejects(
    createOrder({ items: [{ productId: "bad-id", quantity: 1 }] }, { id: customer._id!.toString(), name: customer.name, email: customer.email }, "abcdefghijklmnop"),
    /Your cart contains invalid items/,
  );
});

test("order service rejects client-supplied prices and discounts before database access", async () => {
  await assert.rejects(
    createOrder({
      items: [{ productId: "64b64c000000000000000001", quantity: 1, pricePaise: 1 }],
      couponCode: "SAVE",
      discountPaise: 9_999,
      totalPaise: 1,
    }, { id: customer._id!.toString(), name: customer.name, email: customer.email }, "abcdefghijklmnop"),
    /Your cart contains invalid items/,
  );
});

test("customer order view omits master asset references and idempotency internals", () => {
  const view = toCustomerOrderView({
    _id: new Types.ObjectId(), checkoutIdempotencyKey: "private-key", checkoutRequestHash: "a".repeat(64),
    lines: [{
      productName: "Bundle", productSlug: "bundle", productType: "pdf_bundle", bundleKind: "bundle",
      includedProducts: [{ name: "Guide", slug: "guide", asset: { assetId: new Types.ObjectId(), version: "1" } }],
      asset: { assetId: new Types.ObjectId(), version: "1" }, lineTotalPaise: 500,
    }],
  });
  assert.equal("checkoutIdempotencyKey" in view, false);
  assert.equal("checkoutRequestHash" in view, false);
  assert.equal("asset" in (view.lines[0] ?? {}), false);
  assert.equal("asset" in ((view.lines[0]?.includedProducts[0]) ?? {}), false);
});

test("authenticated order summary preserves every purchased line and its stored amount", () => {
  const productId = new Types.ObjectId();
  const view = toCustomerOrderView({
    _id: new Types.ObjectId(), orderReference: "MTV-MULTI-1", orderStatus: "paid", paymentStatus: "paid",
    subtotalPaise: 30_000, discountPaise: 5_000, taxPaise: 3_813, totalPaise: 25_000, currency: "INR",
    lines: [
      { productId, productName: "Guide One", productSlug: "guide-one", productType: "pdf", quantity: 1, unitPricePaise: 10_000, lineSubtotalPaise: 10_000, discountPaise: 2_000, taxPaise: 1_220, lineTotalPaise: 8_000, includedProducts: [] },
      { productName: "Guide Two", productSlug: "guide-two", productType: "pdf", quantity: 2, unitPricePaise: 10_000, lineSubtotalPaise: 20_000, discountPaise: 3_000, taxPaise: 2_593, lineTotalPaise: 17_000, includedProducts: [] },
    ],
  });
  assert.deepEqual(view.lines.map(({ productName, quantity, lineTotalPaise }) => ({ productName, quantity, lineTotalPaise })), [
    { productName: "Guide One", quantity: 1, lineTotalPaise: 8_000 },
    { productName: "Guide Two", quantity: 2, lineTotalPaise: 17_000 },
  ]);
  assert.equal(view.totalPaise, 25_000);
  assert.equal(view.lines[0]?.productId, productId.toString());
});

test("unpaid customer order views do not reveal Call Guidance fulfillment instructions", () => {
  const source = {
    _id: new Types.ObjectId(), orderReference: "MTV-ORDER-CALL", orderStatus: "awaiting_payment", paymentStatus: "pending",
    lines: [{ productName: "Call Guidance", productSlug: "call-guidance", productType: "call_guidance", quantity: 1,
      unitPricePaise: 2_500, lineSubtotalPaise: 2_500, discountPaise: 0, taxPaise: 0, lineTotalPaise: 2_500,
      fulfilmentInstructions: "Private booking instructions", includedProducts: [] }],
  };
  const pending = toCustomerOrderView(source);
  assert.equal("fulfilmentInstructions" in (pending.lines[0] ?? {}), false);
  assert.equal((toCustomerOrderView({ ...source, orderStatus: "paid", paymentStatus: "paid" }).lines[0] ?? {}).fulfilmentInstructions, "Private booking instructions");
});

test("order endpoints require an authenticated customer before accessing services", async () => {
  let called = false;
  const handlers = createOrderRouteHandlers({
    authorize: async () => { throw new AuthenticationError(); },
    services: { async listCustomerOrders() { called = true; return []; } },
  });
  const response = await handlers.collectionGET(new Request("https://example.test/api/orders"));
  assert.equal(response.status, 401);
  assert.equal(called, false);
});

test("order creation endpoint rejects unauthenticated requests before reading or creating an order", async () => {
  let called = false;
  const handlers = createOrderRouteHandlers({
    authorize: async () => { throw new AuthenticationError(); },
    services: { async createOrder() { called = true; return {}; } },
  });
  const response = await handlers.collectionPOST(new Request("https://example.test/api/orders", {
    method: "POST", headers: { "content-type": "application/json", "idempotency-key": "abcdefghijklmnop" },
    body: JSON.stringify({ items: [{ productId: "64b64c000000000000000001", quantity: 1 }] }),
  }));
  assert.equal(response.status, 401);
  assert.equal(called, false);
});

test("order creation forwards only trusted customer identity and idempotency key", async () => {
  let received: unknown;
  const handlers = createOrderRouteHandlers({
    authorize: async () => customer,
    services: {
      async createOrder(input, trustedCustomer, key) { received = { input, trustedCustomer, key }; return { orderReference: "MTV-ORDER-1" }; },
    },
  });
  const response = await handlers.collectionPOST(new Request("https://example.test/api/orders", {
    method: "POST", headers: { "content-type": "application/json", "idempotency-key": "abcdefghijklmnop" },
    body: JSON.stringify({ items: [{ productId: "64b64c000000000000000001", quantity: 1 }] }),
  }));
  assert.equal(response.status, 201);
  assert.deepEqual(received, {
    input: { items: [{ productId: "64b64c000000000000000001", quantity: 1 }] },
    trustedCustomer: { id: customer._id?.toString(), name: "Customer", email: "buyer@example.com" },
    key: "abcdefghijklmnop",
  });
});

test("customer order detail is always scoped by the authenticated profile", async () => {
  let ids: string[] = [];
  const handlers = createOrderRouteHandlers({
    authorize: async () => customer,
    services: {
      async getCustomerOrder(orderId, userId) { ids = [orderId, userId]; return { id: orderId }; },
    },
  });
  const response = await handlers.itemGET(new Request("https://example.test/api/orders/order-id"), { params: Promise.resolve({ id: "order-id" }) });
  assert.equal(response.status, 200);
  assert.deepEqual(ids, ["order-id", customer._id?.toString()]);
});

