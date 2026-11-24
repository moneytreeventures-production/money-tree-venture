import assert from "node:assert/strict";
import { Types } from "mongoose";
import { test } from "node:test";
import { AuthenticationError } from "../../src/lib/errors/app-error";
import { matchesPurchasedPdf } from "../../src/lib/fulfillment/pdf-access";
import { buildCustomerLibraryPipeline, selectLibraryPurchaseRows } from "../../src/lib/fulfillment/download-service";
import { createPurchaseRouteHandlers } from "../../src/lib/fulfillment/purchase-route-handlers";
import { createBookingRouteHandlers } from "../../src/lib/fulfillment/booking-route-handlers";
import {
  activePaidOrderFilter,
  isDownloadRequestAllowed,
  ownedActiveDownloadPurchaseFilter,
  ownedPersonalizedPdfFilter,
  pdfSourcesForOrderLine,
} from "../../src/lib/fulfillment/entitlement-policy";
import type { User } from "../../src/lib/db/models/user";

const customer = {
  _id: new Types.ObjectId("64b64c000000000000000099"), authUserId: "auth-customer", name: "Buyer",
  email: "buyer@example.com", emailNormalized: "buyer@example.com", role: "customer", status: "active",
} satisfies User;

test("library pagination groups repeat purchases before slicing and verifies payment", () => {
  const userId = new Types.ObjectId();
  const pipeline = buildCustomerLibraryPipeline(userId, 11, 12);
  const groupIndex = pipeline.findIndex((stage) => "$group" in stage);
  const facetIndex = pipeline.findIndex((stage) => "$facet" in stage);
  assert.ok(groupIndex > 0 && facetIndex > groupIndex);
  const facet = pipeline[facetIndex];
  assert.ok("$facet" in facet);
  assert.deepEqual(facet.$facet.items, [{ $skip: 120 }, { $limit: 12 }]);
  assert.deepEqual(facet.$facet.total, [{ $count: "value" }]);
  assert.ok(pipeline.some((stage) => "$lookup" in stage && stage.$lookup.from === "payments"));
  assert.ok(pipeline.some((stage) => "$lookup" in stage && stage.$lookup.from === "personalizedPdfs"));
  assert.ok(pipeline.some((stage) => "$sort" in stage && stage.$sort.hasReadyFile === -1));
  assert.ok(pipeline.some((stage) => "$match" in stage && "verifiedPayment.0" in stage.$match));
});

test("repeat PDF purchases show one library card and surviving paid access after one refund", () => {
  const productId = new Types.ObjectId();
  const older = { productId, productType: "pdf", orderId: "order-one" };
  const newer = { productId, productType: "pdf", orderId: "order-two" };
  assert.deepEqual(selectLibraryPurchaseRows([newer, older]), [newer]);
  assert.deepEqual(selectLibraryPurchaseRows([older]), [older]);
});

test("active purchase access remains valid while a verified refund is pending and ends only after success", () => {
  assert.deepEqual(activePaidOrderFilter(), {
    $or: [
      { orderStatus: "paid", paymentStatus: "paid" },
      { orderStatus: "partially_refunded", paymentStatus: "partially_refunded" },
    ],
  });
  // A successful refund transitions the order to refunded and revokes the purchase in the same transaction.
  assert.deepEqual(activePaidOrderFilter().$or.map((state) => `${state.orderStatus}:${state.paymentStatus}`), [
    "paid:paid", "partially_refunded:partially_refunded",
  ]);
});

test("download ownership filters bind purchase, file, and customer identity", () => {
  const purchaseId = new Types.ObjectId();
  const pdfId = new Types.ObjectId();
  const ownerId = new Types.ObjectId();
  assert.deepEqual(ownedActiveDownloadPurchaseFilter(purchaseId, ownerId), {
    _id: purchaseId, userId: ownerId, accessStatus: "active", entitlementType: "download",
  });
  assert.deepEqual(ownedPersonalizedPdfFilter(pdfId, purchaseId, ownerId), {
    _id: pdfId, purchaseId, userId: ownerId,
  });
});

test("download rate policy enforces per-minute and per-hour limits", () => {
  assert.equal(isDownloadRequestAllowed(true, 29), true);
  assert.equal(isDownloadRequestAllowed(true, 30), false);
  assert.equal(isDownloadRequestAllowed(false, 0), false);
  assert.equal(isDownloadRequestAllowed(true, Number.NaN), false);
});

test("bundle entitlements select only snapshotted PDFs and Call Guidance selects no downloads", () => {
  const pdfA = new Types.ObjectId();
  const pdfB = new Types.ObjectId();
  const assetA = new Types.ObjectId();
  const assetB = new Types.ObjectId();
  const bundle = {
    productId: new Types.ObjectId(), productType: "pdf_bundle" as const, includedProducts: [
      { productId: pdfA, asset: { assetId: assetA, version: "v1" } },
      { productId: pdfB, asset: { assetId: assetB, version: "v2" } },
    ],
  } as never;
  assert.deepEqual(pdfSourcesForOrderLine(bundle), [
    { productId: pdfA, assetId: assetA, version: "v1" },
    { productId: pdfB, assetId: assetB, version: "v2" },
  ]);
  assert.deepEqual(pdfSourcesForOrderLine({ productId: new Types.ObjectId(), productType: "call_guidance" } as never), []);
});

test("purchase download endpoint requires the signed-in owner and invokes no service when anonymous", async () => {
  let called = false;
  const handlers = createPurchaseRouteHandlers({
    authorize: async () => { throw new AuthenticationError(); },
    downloadFile: async () => { called = true; return { bytes: new Uint8Array([37,80,68,70,45]), filename: "moneytree-resource-test.pdf" }; },
  });
  const response = await handlers.downloadGET(new Request("https://example.test/api/purchases/a/files/b/download"), {
    params: Promise.resolve({ id: "a", fileId: "b" }),
  });
  assert.equal(response.status, 401);
  assert.equal(called, false);
});

test("customer booking API always uses the server-resolved profile ID", async () => {
  let received: unknown;
  const handlers = createBookingRouteHandlers({
    authorizeCustomer: async () => customer,
    services: { async requestBookingAvailability(id, userId, input) { received = { id, userId, input }; return { status: "awaiting_scheduling" }; } },
  });
  const response = await handlers.availabilityPATCH(new Request("https://example.test/api/bookings/booking/availability", {
    method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ timezone: "UTC", requestedStartsAt: ["2026-12-01T10:00:00Z"] }),
  }), { params: Promise.resolve({ id: "booking-id" }) });
  assert.equal(response.status, 200);
  assert.deepEqual(received, {
    id: "booking-id", userId: customer._id?.toString(), input: { timezone: "UTC", requestedStartsAt: ["2026-12-01T10:00:00Z"] },
  });
});

test("customer booking mutation rejects a cross-site request before changing availability", async () => {
  let called = false;
  const handlers = createBookingRouteHandlers({ authorizeCustomer: async () => customer,
    services: { async requestBookingAvailability() { called = true; return {}; } } });
  const response = await handlers.availabilityPATCH(new Request("https://example.test/api/bookings/booking/availability", {
    method: "PATCH", headers: { origin: "https://attacker.test" }, body: "{}",
  }), { params: Promise.resolve({ id: "booking" }) });
  assert.equal(response.status, 403);
  assert.equal(called, false);
});

test("customer booking detail API scopes lookup to the signed-in profile", async () => {
  let received: unknown;
  const handlers = createBookingRouteHandlers({
    authorizeCustomer: async () => customer,
    services: { async getCustomerBooking(id, userId) { received = { id, userId }; return { id }; } },
  });
  const response = await handlers.customerItemGET(new Request("https://example.test/api/bookings/booking-id"), {
    params: Promise.resolve({ id: "booking-id" }),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(received, { id: "booking-id", userId: customer._id?.toString() });
});

test("customer booking APIs do not invoke booking services for unauthorized users", async () => {
  let called = false;
  const handlers = createBookingRouteHandlers({
    authorizeCustomer: async () => { throw new AuthenticationError(); },
    services: { async listCustomerBookings() { called = true; return []; } },
  });
  const response = await handlers.customerCollectionGET(new Request("https://example.test/api/bookings"));
  assert.equal(response.status, 401);
  assert.equal(called, false);
});

test("admin booking API denies unauthorized requests before invoking management services", async () => {
  let called = false;
  const handlers = createBookingRouteHandlers({
    authorizeAdmin: async () => { throw new AuthenticationError(); },
    services: { async manageBooking() { called = true; return {}; } },
  });
  const response = await handlers.adminItemPATCH(new Request("https://example.test/api/admin/bookings/booking", {
    method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "scheduled" }),
  }), { params: Promise.resolve({ id: "booking-id" }) });
  assert.equal(response.status, 401);
  assert.equal(called, false);
});


test("authenticated PDF response contains bytes with private headers and no storage URL", async () => {
  const handlers = createPurchaseRouteHandlers({
    authorize: async () => customer,
    downloadFile: async () => ({ bytes: new Uint8Array([37,80,68,70,45]), filename: "moneytree-resource-test.pdf" }),
  });
  const response = await handlers.downloadGET(new Request("https://example.test/api/purchases/a/files/b/download"), { params: Promise.resolve({ id: "a", fileId: "b" }) });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/pdf");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.match(response.headers.get("content-disposition") ?? "", /^attachment; filename="moneytree-resource-test.pdf"$/);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), new Uint8Array([37,80,68,70,45]));
});


test("personalized PDF access binds purchaser key, product, asset and version", () => {
  const purchaseId = new Types.ObjectId();
  const productId = new Types.ObjectId();
  const assetId = new Types.ObjectId();
  const source = [{ productId, assetId, version: "v2" }];
  const file = { productId, sourceAssetId: assetId, sourceAssetVersion: "v2", objectKey: `personalized/${purchaseId.toString()}/00000000-0000-4000-8000-000000000001.pdf` };
  assert.equal(matchesPurchasedPdf(source, file, purchaseId), true);
  assert.equal(matchesPurchasedPdf(source, { ...file, sourceAssetVersion: "v1" }, purchaseId), false);
  assert.equal(matchesPurchasedPdf(source, file, new Types.ObjectId()), false);
});
