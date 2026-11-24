import assert from "node:assert/strict";
import { test } from "node:test";
import mongoose, { Schema } from "mongoose";
import { CheckoutClaimModel } from "../../src/lib/db/models/checkout-claim";
import { paymentSnapshotIssues } from "../../src/lib/checkout/payment-snapshot-validation";
import {
  AuditLogModel,
  BookingModel,
  CategoryModel,
  CouponModel,
  CouponRedemptionModel,
  DownloadLogModel,
  DownloadRateLimitModel,
  OrderModel,
  OutboxEventModel,
  PaymentModel,
  PersonalizedPdfModel,
  ProductAssetModel,
  ProductMediaModel,
  ProductModel,
  PurchaseModel,
  RefundModel,
  UserModel,
  WebhookEventModel,
  auditLogSchema,
  bookingSchema,
  categorySchema,
  couponSchema,
  couponRedemptionSchema,
  orderSchema,
  orderLineSchema,
  outboxEventSchema,
  paymentSchema,
  productAssetSchema,
  productMediaSchema,
  productSchema,
  purchaseSchema,
  refundSchema,
  userSchema,
  webhookEventSchema,
} from "../../src/lib/db/models";
import { registerModel } from "../../src/lib/db/models/common";

async function errorForValidation(document: { validate: () => Promise<unknown> }): Promise<mongoose.Error.ValidationError> {
  try {
    await document.validate();
  } catch (error) {
    assert.ok(error instanceof mongoose.Error.ValidationError);
    return error;
  }
  assert.fail("Expected the document to fail validation.");
}

const validLine = (overrides: Record<string, unknown> = {}) => ({
  productId: new mongoose.Types.ObjectId(),
  productName: "Approved PDF guide",
  productSlug: "approved-pdf-guide",
  productType: "pdf",
  quantity: 1,
  unitPricePaise: 2500,
  lineSubtotalPaise: 2500,
  discountPaise: 0,
  taxPaise: 0,
  lineTotalPaise: 2500,
  asset: { assetId: new mongoose.Types.ObjectId(), version: "1", sha256: "a".repeat(64) },
  ...overrides,
});

test("all planned domain models register without OverwriteModelError", () => {
  const models = [UserModel, CategoryModel, ProductModel, ProductAssetModel, ProductMediaModel, OrderModel, PaymentModel, PurchaseModel, PersonalizedPdfModel, DownloadLogModel, DownloadRateLimitModel, CouponModel, CouponRedemptionModel, BookingModel, WebhookEventModel, OutboxEventModel, AuditLogModel, RefundModel];
  assert.equal(models.length, 18);
  assert.doesNotThrow(() => registerModel("MoneyTreeRegistrationCheck", new Schema({ value: String })));
  const registered = mongoose.models.MoneyTreeRegistrationCheck;
  assert.equal(registerModel("MoneyTreeRegistrationCheck", new Schema({ changed: Number })), registered);
});

test("user defaults to customer and requires the stable auth identity and profile fields", async () => {
  const user = new UserModel({ name: "A Customer", email: "User@example.com", emailNormalized: "user@example.com" });
  const error = await errorForValidation(user);
  assert.ok(error.errors.authUserId);

  const valid = new UserModel({ authUserId: "auth-user-1", name: "A Customer", email: "User@example.com", emailNormalized: "user@example.com" });
  await valid.validate();
  assert.equal(valid.role, "customer");
  assert.equal(valid.email, "user@example.com");

  const invalidRole = new UserModel({ authUserId: "auth-user-2", name: "A Customer", email: "a@example.com", emailNormalized: "a@example.com", role: "owner" as never });
  assert.ok((await errorForValidation(invalidRole)).errors.role);
});

test("category slug is normalized and required", async () => {
  const category = new CategoryModel({ name: "Design", slug: "Web Design" });
  assert.ok((await errorForValidation(category)).errors.slug);
});

test("product validates integer paise, publication requirements, and bundle structure", async () => {
  const invalidPrice = new ProductModel({ name: "Guide", slug: "guide", shortDescription: "A guide", productType: "pdf", pricePaise: 10.5 });
  assert.ok((await errorForValidation(invalidPrice)).errors.pricePaise);

  const publishedPdf = new ProductModel({ name: "Guide", slug: "guide", shortDescription: "A guide", productType: "pdf", pricePaise: 100, publicationStatus: "published" });
  assert.ok((await errorForValidation(publishedPdf)).errors.primaryAssetId);

  const selfId = new mongoose.Types.ObjectId();
  const selfBundle = new ProductModel({ _id: selfId, name: "Bundle", slug: "bundle", shortDescription: "A bundle", productType: "pdf_bundle", bundleKind: "bundle", pricePaise: 500, includedProductIds: [selfId] });
  assert.ok((await errorForValidation(selfBundle)).errors.includedProductIds);

  const duplicateId = new mongoose.Types.ObjectId();
  const duplicateBundle = new ProductModel({ name: "Bundle", slug: "bundle-2", shortDescription: "A bundle", productType: "pdf_bundle", bundleKind: "bundle", pricePaise: 500, includedProductIds: [duplicateId, duplicateId] });
  assert.ok((await errorForValidation(duplicateBundle)).errors.includedProductIds);

  const missingBundleKind = new ProductModel({ name: "Kit", slug: "kit", shortDescription: "A kit", productType: "pdf_bundle", pricePaise: 500, includedProductIds: [new mongoose.Types.ObjectId()] });
  assert.ok((await errorForValidation(missingBundleKind)).errors.bundleKind);

  const nonBundleKind = new ProductModel({ name: "Guide", slug: "guide-with-kind", shortDescription: "A guide", productType: "pdf", bundleKind: "bundle", pricePaise: 500 });
  assert.ok((await errorForValidation(nonBundleKind)).errors.bundleKind);

  const invalidCall = new ProductModel({ name: "Guidance", slug: "guidance", shortDescription: "Call", productType: "call_guidance", pricePaise: 500, publicationStatus: "published" });
  const callError = await errorForValidation(invalidCall);
  assert.ok(callError.errors.callDurationMinutes);
  assert.ok(callError.errors.fulfilmentInstructions);
});

test("product assets accept only PDF masters and private object keys", async () => {
  const invalidAsset = new ProductAssetModel({
    productId: new mongoose.Types.ObjectId(),
    objectKey: "https://public.example.com/master.pdf",
    version: "1",
    originalFileName: "master.pdf",
    sizeBytes: 100,
    mimeType: "application/zip",
    uploadedBy: new mongoose.Types.ObjectId(),
  });
  const error = await errorForValidation(invalidAsset);
  assert.ok(error.errors.mimeType);
  assert.ok(error.errors.objectKey);
});

test("checkout claims distinguish active, completed, released and refunded states", async () => {
  const base = { userId: new mongoose.Types.ObjectId(), productId: new mongoose.Types.ObjectId(), orderId: new mongoose.Types.ObjectId() };
  for (const status of ["active", "completed", "released", "refunded"] as const) {
    const claim = new CheckoutClaimModel({ ...base, status });
    assert.equal(await claim.validate(), undefined);
  }
  const invalid = new CheckoutClaimModel({ ...base, status: "unknown" });
  assert.ok((await errorForValidation(invalid)).errors.status);
});

test("order preserves immutable purchase snapshots and validates totals", async () => {
  const line = validLine();
  const order = new OrderModel({
    orderReference: "MTV-ORDER-1",
    userId: new mongoose.Types.ObjectId(),
    gatewayEnvironment: "sandbox",
    customerSnapshot: { name: "Buyer", email: "buyer@example.com" },
    lines: [line], subtotalPaise: 2500, discountPaise: 0, taxPaise: 0, totalPaise: 2500,
    taxSnapshot: { rateBasisPoints: 0, calculationVersion: "inclusive-tax-v1" },
  });
  await order.validate();
  assert.equal(order.lines[0]?.productName, "Approved PDF guide");
  assert.equal(order.lines[0]?.asset?.version, "1");
  assert.equal(orderLineSchema.path("productName")?.options.immutable, true);
  for (const path of ["lines", "subtotalPaise", "discountPaise", "taxPaise", "totalPaise", "currency", "gatewayEnvironment"]) {
    assert.equal(orderSchema.path(path)?.options.immutable, true, `${path} must preserve the created pricing snapshot`);
  }
  for (const path of ["taxSnapshot.rateBasisPoints", "taxSnapshot.calculationVersion", "couponSnapshot.couponId", "couponSnapshot.code", "couponSnapshot.discountPaise"]) {
    assert.equal(orderSchema.path(path)?.options.immutable, true, `${path} must preserve the created pricing snapshot`);
  }

  const bundleLine = validLine({
    productType: "pdf_bundle", bundleKind: "starter_kit", asset: undefined,
    includedProducts: [{ productId: new mongoose.Types.ObjectId(), name: "Included PDF", slug: "included-pdf", asset: { assetId: new mongoose.Types.ObjectId(), version: "3" } }],
  });
  const callLine = validLine({
    productType: "call_guidance", asset: undefined, callDurationMinutes: 30,
    fulfilmentInstructions: "Scheduling instructions", includedProducts: [],
  });
  const snapshotOrder = new OrderModel({
    orderReference: "MTV-ORDER-SNAPSHOT", userId: new mongoose.Types.ObjectId(), gatewayEnvironment: "sandbox",
    customerSnapshot: { name: "Buyer", email: "buyer@example.com" },
    lines: [bundleLine, callLine], subtotalPaise: 5000, discountPaise: 0, taxPaise: 0, totalPaise: 5000,
    taxSnapshot: { rateBasisPoints: 0, calculationVersion: "inclusive-tax-v1" },
  });
  await snapshotOrder.validate();
  assert.equal(snapshotOrder.lines[0]?.bundleKind, "starter_kit");
  assert.equal(snapshotOrder.lines[1]?.fulfilmentInstructions, "Scheduling instructions");
  assert.equal(orderLineSchema.path("bundleKind")?.options.immutable, true);
  assert.equal(orderLineSchema.path("fulfilmentInstructions")?.options.immutable, true);

  const mismatched = new OrderModel({
    orderReference: "MTV-ORDER-2",
    userId: new mongoose.Types.ObjectId(),
    gatewayEnvironment: "sandbox",
    customerSnapshot: { name: "Buyer", email: "buyer@example.com" },
    lines: [validLine()], subtotalPaise: 2500, discountPaise: 0, taxPaise: 0, totalPaise: 2400,
    taxSnapshot: { rateBasisPoints: 0, calculationVersion: "inclusive-tax-v1" },
  });
  assert.ok((await errorForValidation(mismatched)).errors.totalPaise);

  const invalidBundle = new OrderModel({
    orderReference: "MTV-ORDER-3",
    userId: new mongoose.Types.ObjectId(),
    gatewayEnvironment: "sandbox",
    customerSnapshot: { name: "Buyer", email: "buyer@example.com" },
    lines: [validLine({ productType: "pdf_bundle", bundleKind: "bundle", includedProducts: [], asset: undefined })],
    subtotalPaise: 2500, discountPaise: 0, taxPaise: 0, totalPaise: 2500,
    taxSnapshot: { rateBasisPoints: 0, calculationVersion: "inclusive-tax-v1" },
  });
  assert.ok((await errorForValidation(invalidBundle)).errors["lines.0.includedProducts"]);
});

test("hydrated financial snapshot validates asynchronously before payment state transition", async () => {
  const order = new OrderModel({
    orderReference: "MTV-HYDRATED-VALIDATION", userId: new mongoose.Types.ObjectId(), gatewayEnvironment: "sandbox",
    customerSnapshot: { name: "Fixture Buyer", email: "fixture@example.invalid" }, lines: [validLine()],
    subtotalPaise: 2500, discountPaise: 0, taxPaise: 0, totalPaise: 2500,
    currency: "INR", taxSnapshot: { rateBasisPoints: 0, calculationVersion: "inclusive-tax-v1" },
    orderStatus: "awaiting_payment", paymentStatus: "unpaid", expiresAt: new Date(Date.now() + 60_000),
  });
  await order.validate();
  const hydrated = OrderModel.hydrate(order.toObject());
  assert.deepEqual(hydrated.modifiedPaths(), []);
  const syncError = hydrated.validateSync();
  assert.ok(syncError instanceof mongoose.Error.ValidationError);
  assert.deepEqual(Object.keys(syncError.errors).sort(), ["currency", "discountPaise", "taxPaise"]);
  for (const issue of Object.values(syncError.errors) as Error[]) {
    assert.ok(issue instanceof mongoose.Error.StrictModeError);
    assert.match(issue.message, /immutable and strict mode is set to throw/);
  }
  await hydrated.validate();
  hydrated.paymentStatus = "pending";
  await hydrated.validate();
  const snapshotIssues = paymentSnapshotIssues(hydrated.toObject({ depopulate: true }));
  assert.deepEqual(snapshotIssues, []);
  hydrated.set("discountPaise", 100);
  assert.equal(hydrated.discountPaise, 0);
  assert.equal(hydrated.taxPaise, 0);
  assert.equal(hydrated.currency, "INR");
});

test("payment snapshot validation checks INR totals, coupons, inclusive tax and malformed values", () => {
  const base = {
    currency: "INR", subtotalPaise: 2500, discountPaise: 0, taxPaise: 0, totalPaise: 2500,
    taxSnapshot: { rateBasisPoints: 0, calculationVersion: "inclusive-tax-v1" }, lines: [validLine()],
  };
  assert.deepEqual(paymentSnapshotIssues(base), []);
  const couponOrder = {
    ...base, discountPaise: 500, totalPaise: 2000,
    lines: [validLine({ discountPaise: 500, lineTotalPaise: 2000 })],
  };
  assert.deepEqual(paymentSnapshotIssues(couponOrder), []);
  const inclusiveTaxOrder = {
    ...base, subtotalPaise: 19900, taxPaise: 3036, totalPaise: 19900,
    taxSnapshot: { rateBasisPoints: 1800, calculationVersion: "inclusive-tax-v1" },
    lines: [validLine({ unitPricePaise: 19900, lineSubtotalPaise: 19900, lineTotalPaise: 19900, taxPaise: 3036 })],
  };
  assert.deepEqual(paymentSnapshotIssues(inclusiveTaxOrder), []);
  assert.deepEqual(paymentSnapshotIssues({ ...base, currency: "USD", discountPaise: undefined }), ["discountPaise", "currency"]);
});

test("hydrated payment success transitions cannot validate immutable financial snapshots", async () => {
  const order = new OrderModel({
    orderReference: "MTV-ORDER-PAID-TRANSITION", userId: new mongoose.Types.ObjectId(), gatewayEnvironment: "sandbox",
    customerSnapshot: { name: "Fixture Buyer", email: "fixture@example.invalid" }, lines: [validLine()],
    subtotalPaise: 2500, discountPaise: 0, taxPaise: 0, totalPaise: 2500, currency: "INR",
    taxSnapshot: { rateBasisPoints: 0, calculationVersion: "inclusive-tax-v1" }, orderStatus: "awaiting_payment",
    paymentStatus: "pending", expiresAt: new Date(Date.now() + 60_000),
  });
  await order.validate();
  const hydratedOrder = OrderModel.hydrate(order.toObject());
  hydratedOrder.orderStatus = "paid";
  hydratedOrder.paymentStatus = "paid";
  hydratedOrder.paidAt = new Date();
  await assert.rejects(hydratedOrder.validate(), (error: unknown) => {
    assert.ok(error instanceof mongoose.Error.ValidationError);
    assert.deepEqual(Object.keys(error.errors).sort(), ["currency", "discountPaise", "taxPaise"]);
    assert.ok(Object.values(error.errors).every((issue) => issue instanceof mongoose.Error.StrictModeError));
    return true;
  });
  assert.equal(hydratedOrder.discountPaise, 0);
  assert.equal(hydratedOrder.taxPaise, 0);
  assert.equal(hydratedOrder.currency, "INR");

  const payment = new PaymentModel({
    paymentReference: "PAY-PAID-TRANSITION", orderId: hydratedOrder._id, userId: hydratedOrder.userId,
    gatewayEnvironment: "sandbox", cashfreeOrderId: "MTVP-PAID-TRANSITION", amountPaise: 2500,
    currency: "INR", status: "pending",
  });
  await payment.validate();
  const hydratedPayment = PaymentModel.hydrate(payment.toObject());
  hydratedPayment.status = "success";
  hydratedPayment.providerStatus = "SUCCESS";
  hydratedPayment.cashfreePaymentId = "fixture-payment-id";
  hydratedPayment.paidAt = new Date();
  await assert.rejects(hydratedPayment.validate(), (error: unknown) => {
    assert.ok(error instanceof mongoose.Error.ValidationError);
    assert.deepEqual(Object.keys(error.errors), ["currency"]);
    assert.ok(error.errors.currency instanceof mongoose.Error.StrictModeError);
    return true;
  });
  assert.equal(hydratedPayment.amountPaise, 2500);
  assert.equal(hydratedPayment.currency, "INR");
});

test("payment attempts remain separate and validate status and paise", async () => {
  const payment = new PaymentModel({
    paymentReference: "MTV-PAY-1", orderId: new mongoose.Types.ObjectId(), userId: new mongoose.Types.ObjectId(),
    gatewayEnvironment: "sandbox", amountPaise: 100.25, status: "successful" as never,
  });
  const error = await errorForValidation(payment);
  assert.ok(error.errors.amountPaise);
  assert.ok(error.errors.status);
});

test("refund attempts require full INR amounts, stable provider IDs, and retain per-order history", async () => {
  const refund = new RefundModel({
    orderId: new mongoose.Types.ObjectId(), paymentId: new mongoose.Types.ObjectId(), userId: new mongoose.Types.ObjectId(),
    adminUserId: new mongoose.Types.ObjectId(), gatewayEnvironment: "sandbox", cashfreeOrderId: "cf-order-1",
    cashfreePaymentId: "cf-payment-1", refundId: "MTVR123456", idempotencyKey: "12345678-1234-4234-8234-123456789012",
    amountPaise: 1.5, currency: "USD", reason: "customer asked", status: "unknown" as never,
  });
  const error = await errorForValidation(refund);
  assert.ok(error.errors.amountPaise);
  assert.ok(error.errors.currency);
  assert.ok(error.errors.status);
  assert.equal(indexOptions(refundSchema, { orderId: 1 })?.unique, undefined);
  assert.ok(indexOptions(refundSchema, { orderId: 1, createdAt: -1 }));
  assert.equal(indexOptions(refundSchema, { cashfreeOrderId: 1, refundId: 1 })?.unique, true);
  assert.equal(indexOptions(refundSchema, { idempotencyKey: 1 })?.unique, true);
});

test("purchase entitlements distinguish downloadable bundles from booking products", async () => {
  const invalidCallPurchase = new PurchaseModel({
    userId: new mongoose.Types.ObjectId(), orderId: new mongoose.Types.ObjectId(), orderLineId: new mongoose.Types.ObjectId(),
    productId: new mongoose.Types.ObjectId(), productType: "call_guidance", entitlementType: "download",
  });
  assert.ok((await errorForValidation(invalidCallPurchase)).errors.entitlementType);

  const bundlePurchase = new PurchaseModel({
    userId: new mongoose.Types.ObjectId(), orderId: new mongoose.Types.ObjectId(), orderLineId: new mongoose.Types.ObjectId(),
    productId: new mongoose.Types.ObjectId(), productType: "pdf_bundle", entitlementType: "download",
    bundleItems: [{ productId: new mongoose.Types.ObjectId(), productName: "PDF", productSlug: "pdf", assetId: new mongoose.Types.ObjectId(), assetVersion: "2" }],
  });
  await bundlePurchase.validate();
});

test("personalized PDF and download models enforce private ready-copy metadata and rate indexes", async () => {
  const invalid = new PersonalizedPdfModel({
    purchaseId: new mongoose.Types.ObjectId(), userId: new mongoose.Types.ObjectId(), productId: new mongoose.Types.ObjectId(),
    sourceAssetId: new mongoose.Types.ObjectId(), sourceAssetVersion: "1", objectKey: "public/file.pdf", status: "ready",
  });
  const error = await errorForValidation(invalid);
  assert.ok(error.errors.objectKey);
  assert.ok(error.errors.status);
  const denied = new DownloadLogModel({
    userId: new mongoose.Types.ObjectId(), purchaseId: new mongoose.Types.ObjectId(), personalizedPdfId: new mongoose.Types.ObjectId(), result: "denied",
  });
  await denied.validate();
  const rate = new DownloadRateLimitModel({ userId: new mongoose.Types.ObjectId(), windowStart: new Date(), requestCount: 1 });
  await rate.validate();
});

test("coupon validates percentage bounds, date ranges, and redemption structure", async () => {
  const coupon = new CouponModel({
    code: "SAVE", discountType: "percentage", discountValue: 10_001,
    validFrom: new Date("2026-01-02"), validUntil: new Date("2026-01-01"), status: "active",
  });
  const error = await errorForValidation(coupon);
  assert.ok(error.errors.discountValue);
  assert.ok(error.errors.validUntil);

  const redemption = new CouponRedemptionModel({ couponId: new mongoose.Types.ObjectId(), userId: new mongoose.Types.ObjectId(), orderId: new mongoose.Types.ObjectId(), discountPaise: 10.4 });
  assert.ok((await errorForValidation(redemption)).errors.discountPaise);
});

test("booking requires an entitlement reference and valid schedule details", async () => {
  const booking = new BookingModel({
    bookingReference: "MTV-BOOK-1", userId: new mongoose.Types.ObjectId(), orderId: new mongoose.Types.ObjectId(),
    purchaseId: new mongoose.Types.ObjectId(), productId: new mongoose.Types.ObjectId(), status: "scheduled",
    sessionDurationMinutes: 30, schedulingInstructions: "Schedule by email.",
  });
  assert.ok((await errorForValidation(booking)).errors.scheduledStartAt);
});

test("webhook and outbox payloads validate, without unbounded raw event payloads", async () => {
  const webhook = new WebhookEventModel({ provider: "razorpay" as never, providerEventId: "evt-1", eventType: "paid", payloadDigest: "a".repeat(64) });
  assert.ok((await errorForValidation(webhook)).errors.provider);

  const aggregateId = new mongoose.Types.ObjectId();
  const outbox = new OutboxEventModel({
    eventType: "purchase_confirmation", aggregateType: "order", aggregateId,
    payload: { orderId: new mongoose.Types.ObjectId(), rawRequest: "unexpected" } as never,
  });
  assert.ok((await errorForValidation(outbox)).errors.payload);

  const refundId = new mongoose.Types.ObjectId();
  const refundOutbox = new OutboxEventModel({
    eventType: "refund_confirmation", aggregateType: "order", aggregateId,
    dedupeKey: `refund-confirmation:${refundId.toString()}`,
    payload: { userId: new mongoose.Types.ObjectId(), orderId: aggregateId, refundId },
  });
  await refundOutbox.validate();
});

function indexOptions(schema: Schema, fields: Record<string, unknown>) {
  return schema.indexes().find(([keys]) => JSON.stringify(keys) === JSON.stringify(fields))?.[1];
}

test("required uniqueness and query indexes are declared without connecting to MongoDB", () => {
  assert.equal(indexOptions(userSchema, { authUserId: 1 })?.unique, true);
  assert.equal(userSchema.options.collection, "users");
  assert.equal(indexOptions(categorySchema, { slug: 1 })?.unique, true);
  assert.equal(categorySchema.options.collection, "categories");
  assert.equal(indexOptions(productSchema, { slug: 1 })?.unique, true);
  assert.equal(productSchema.options.collection, "products");
  assert.ok(indexOptions(productSchema, { categoryIds: 1, publicationStatus: 1, displayOrder: 1 }));
  assert.ok(indexOptions(productSchema, { productType: 1, publicationStatus: 1, displayOrder: 1 }));
  assert.ok(indexOptions(productSchema, { name: "text", shortDescription: "text", description: "text" }));
  assert.ok(indexOptions(productSchema, { publicationStatus: 1, pricePaise: 1, createdAt: -1, _id: -1 }));
  assert.ok(indexOptions(productSchema, { publicationStatus: 1, featured: -1, displayOrder: 1, createdAt: -1, _id: -1 }));
  assert.ok(indexOptions(productSchema, { categoryIds: 1, publicationStatus: 1, featured: -1, displayOrder: 1 }));
  assert.equal(productSchema.options.optimisticConcurrency, true);
  assert.ok(indexOptions(productAssetSchema, { productId: 1, version: 1 })?.unique);
  assert.equal(indexOptions(productMediaSchema, { uploadId: 1 })?.unique, true);
  assert.ok(indexOptions(productMediaSchema, { productId: 1, kind: 1, status: 1, createdAt: -1 }));
  assert.equal(indexOptions(productMediaSchema, { objectKey: 1 })?.sparse, true);
  assert.ok(indexOptions(orderSchema, { orderReference: 1 })?.unique);
  assert.ok(indexOptions(orderSchema, { userId: 1, createdAt: -1 }));
  assert.ok(indexOptions(orderSchema, { orderStatus: 1, createdAt: -1 }));
  assert.ok(indexOptions(paymentSchema, { paymentReference: 1 })?.unique);
  assert.ok(indexOptions(paymentSchema, { cashfreeOrderId: 1, createdAt: -1 }));
  assert.ok(indexOptions(paymentSchema, { cashfreePaymentId: 1 })?.partialFilterExpression);
  assert.equal(indexOptions(paymentSchema, { userId: 1, orderId: 1, checkoutRequestKey: 1 })?.unique, true);
  assert.ok(indexOptions(paymentSchema, { orderId: 1, createdAt: -1 }));
  assert.equal(indexOptions(purchaseSchema, { orderLineId: 1 })?.unique, true);
  assert.equal(indexOptions(purchaseSchema, { userId: 1, productId: 1, grantedAt: -1 })?.unique, undefined);
  assert.ok(indexOptions(couponSchema, { code: 1 })?.partialFilterExpression);
  assert.ok(indexOptions(couponRedemptionSchema, { couponId: 1, orderId: 1 })?.unique);
  assert.ok(indexOptions(bookingSchema, { userId: 1, status: 1, updatedAt: -1 }));
  assert.ok(indexOptions(bookingSchema, { bookingReference: 1 })?.unique);
  assert.ok(indexOptions(bookingSchema, { purchaseId: 1 })?.unique);
  assert.ok(indexOptions(webhookEventSchema, { provider: 1, providerEventId: 1 })?.unique);
  assert.ok(indexOptions(outboxEventSchema, { status: 1, nextAttemptAt: 1 }));
  assert.ok(indexOptions(outboxEventSchema, { dedupeKey: 1 })?.partialFilterExpression);
  assert.ok(indexOptions(auditLogSchema, { targetType: 1, targetId: 1, createdAt: -1 }));
});
