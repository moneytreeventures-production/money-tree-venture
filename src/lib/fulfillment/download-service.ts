import "server-only";

import { requireVerifiedPdfPurchase, matchesPurchasedPdf } from "./pdf-access";
import { createHash } from "node:crypto";
import { PDF_WATERMARK_VERSION } from "./pdf-personalization";
import { Types, type PipelineStage } from "mongoose";
import { connectToDatabase } from "../db/mongodb";
import { DownloadLogModel, DownloadRateLimitModel, OrderModel, PaymentModel, PersonalizedPdfModel, ProductModel, PurchaseModel, type Order, type Purchase } from "../db/models";
import { NotFoundError, RateLimitError, ValidationError } from "../errors/app-error";
import { getR2Storage } from "../storage/r2/client";
import { processPurchasePdfPersonalization } from "./pdf-service";
import {
  activePaidOrderFilter,
  isDownloadRequestAllowed,
  ownedActiveDownloadPurchaseFilter,
  ownedPersonalizedPdfFilter,
} from "./entitlement-policy";

const PER_MINUTE_LIMIT = 5;
const PER_HOUR_LIMIT = 30;

function objectId(value: string, field: string): Types.ObjectId {
  if (!/^[a-f0-9]{24}$/i.test(value)) throw new ValidationError([{ field, message: "This resource reference is invalid." }]);
  return new Types.ObjectId(value);
}

async function recordDownloadOutcome(input: { userId: Types.ObjectId; purchaseId: Types.ObjectId; pdfId: Types.ObjectId; result: "issued" | "rate_limited"; failureCode?: string }) {
  await DownloadLogModel.create({
    userId: input.userId,
    purchaseId: input.purchaseId,
    personalizedPdfId: input.pdfId,
    result: input.result,
    ...(input.failureCode ? { failureCode: input.failureCode } : {}),
  });
}

async function consumePerMinuteLimit(userId: Types.ObjectId, now: Date): Promise<boolean> {
  const windowStart = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
  try {
    const counter = await DownloadRateLimitModel.findOneAndUpdate(
      { userId, windowStart },
      { $inc: { requestCount: 1 } },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
    ).lean().exec();
    return (counter?.requestCount ?? 0) <= PER_MINUTE_LIMIT;
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) {
    const counter = await DownloadRateLimitModel.findOneAndUpdate({ userId, windowStart }, { $inc: { requestCount: 1 } }, { returnDocument: "after" }).lean().exec();
      return (counter?.requestCount ?? PER_MINUTE_LIMIT + 1) <= PER_MINUTE_LIMIT;
    }
    throw error;
  }
}

export async function listCustomerPurchases(customerIdValue: string) {
  await connectToDatabase();
  const userId = objectId(customerIdValue, "userId");
  const purchases = await PurchaseModel.find({ userId, accessStatus: "active" }).sort({ grantedAt: -1 }).limit(100).lean().exec();
  const orderIds = [...new Map(purchases.map((purchase) => [purchase.orderId.toString(), purchase.orderId])).values()];
  const orders = orderIds.length ? await OrderModel.find({ _id: { $in: orderIds }, userId, ...activePaidOrderFilter() }).lean().exec() : [];
  const orderById = new Map(orders.map((order) => [order._id.toString(), order]));
  const purchaseIds = purchases.map((purchase) => purchase._id);
  const files = purchaseIds.length ? await PersonalizedPdfModel.find({ purchaseId: { $in: purchaseIds }, userId }).lean().exec() : [];
  const filesByPurchase = new Map<string, typeof files>();
  for (const file of files) {
    const key = file.purchaseId.toString();
    filesByPurchase.set(key, [...(filesByPurchase.get(key) ?? []), file]);
  }
  const paidPayments = orderIds.length ? await PaymentModel.find({ orderId: { $in: orderIds }, userId, status: "success", providerStatus: "SUCCESS", currency: "INR", cashfreeOrderId: { $type: "string" }, cashfreePaymentId: { $type: "string" } }).select("orderId amountPaise gatewayEnvironment").lean().exec() : [];
  const verified = purchases.filter((purchase) => { const order = orderById.get(purchase.orderId.toString()); return order && paidPayments.some((payment) => payment.orderId.equals(order._id) && payment.amountPaise === order.totalPaise && payment.gatewayEnvironment === order.gatewayEnvironment); });
  const visible = selectLibraryPurchaseRows(verified);
  return visible.map((purchase) => {
    const order = orderById.get(purchase.orderId.toString());
    const line = order?.lines.find((item) => item._id?.equals(purchase.orderLineId));
    return {
      id: purchase._id.toString(), productId: purchase.productId.toString(), productSlug: line?.productSlug, orderId: purchase.orderId.toString(),
      orderReference: order?.orderReference,
      productName: line?.productName ?? "Digital product",
      productType: purchase.productType,
      entitlementType: purchase.entitlementType,
      grantedAt: purchase.grantedAt,
      files: (filesByPurchase.get(purchase._id.toString()) ?? []).map((file) => ({
        id: file._id.toString(), productId: file.productId.toString(),
        productName: line?.includedProducts.find((item) => item.productId?.equals(file.productId))?.name ?? line?.productName ?? "PDF resource",
        sourceAssetVersion: file.sourceAssetVersion, status: file.status,
      })),
    };
  });
}

/** Keep one PDF card per product while each paid order remains in order history. */
export function selectLibraryPurchaseRows<T extends { productId: { toString(): string }; productType: string }>(purchases: T[]): T[] {
  const seen = new Set<string>();
  return purchases.filter((purchase) => {
    if (purchase.productType === "call_guidance") return true;
    const id = purchase.productId.toString();
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export function buildCustomerLibraryPipeline(userId: Types.ObjectId, page: number, pageSize: number): PipelineStage[] {
  return [
    { $match: { userId, accessStatus: "active", entitlementType: "download" } },
    { $lookup: { from: "orders", localField: "orderId", foreignField: "_id", as: "order" } },
    { $unwind: "$order" },
    { $match: { "order.userId": userId, $or: [
      { "order.orderStatus": "paid", "order.paymentStatus": "paid" },
      { "order.orderStatus": "partially_refunded", "order.paymentStatus": "partially_refunded" },
    ] } },
    { $lookup: { from: "payments", let: { orderId: "$orderId", amount: "$order.totalPaise", environment: "$order.gatewayEnvironment" }, pipeline: [
      { $match: { userId, status: "success", providerStatus: "SUCCESS", currency: "INR", cashfreeOrderId: { $type: "string" }, cashfreePaymentId: { $type: "string" },
        $expr: { $and: [{ $eq: ["$orderId", "$$orderId"] }, { $eq: ["$amountPaise", "$$amount"] }, { $eq: ["$gatewayEnvironment", "$$environment"] }] } } },
      { $limit: 1 },
    ], as: "verifiedPayment" } },
    { $match: { "verifiedPayment.0": { $exists: true } } },
    { $lookup: { from: "personalizedPdfs", let: { purchaseId: "$_id" }, pipeline: [
      { $match: { userId, status: "ready", $expr: { $eq: ["$purchaseId", "$$purchaseId"] } } },
      { $limit: 1 },
    ], as: "readyFiles" } },
    { $addFields: { hasReadyFile: { $gt: [{ $size: "$readyFiles" }, 0] } } },
    { $sort: { hasReadyFile: -1, grantedAt: -1, _id: -1 } },
    { $group: { _id: "$productId", purchase: { $first: "$$ROOT" }, purchaseCount: { $sum: 1 } } },
    { $sort: { "purchase.grantedAt": -1, "purchase._id": -1 } },
    { $facet: { items: [{ $skip: (page - 1) * pageSize }, { $limit: pageSize }], total: [{ $count: "value" }] } },
  ];
}

/** Paginate verified, distinct PDF products in MongoDB before loading files. */
export async function listCustomerLibraryPage(customerIdValue: string, page: number, pageSize = 12) {
  if (!Number.isInteger(page) || page < 1 || page > 100_000 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) {
    throw new ValidationError([{ field: "page", message: "Library page is invalid." }]);
  }
  await connectToDatabase();
  const userId = objectId(customerIdValue, "userId");
  const pipeline = buildCustomerLibraryPipeline(userId, page, pageSize);
  type Row = { purchase: Purchase & { _id: Types.ObjectId; order: Order & { _id: Types.ObjectId } }; purchaseCount: number };
  const [result] = await PurchaseModel.aggregate<{ items: Row[]; total: Array<{ value: number }> }>(pipeline);
  const rows = result?.items ?? [];
  const ids = rows.map((row) => row.purchase._id);
  const productIds = rows.map((row) => row.purchase.productId);
  const [files, products] = await Promise.all([
    ids.length ? PersonalizedPdfModel.find({ userId, purchaseId: { $in: ids } }).lean().exec() : Promise.resolve([]),
    productIds.length ? ProductModel.find({ _id: { $in: productIds } }).select("imageRefs").lean().exec() : Promise.resolve([]),
  ]);
  const fileByPurchase = new Map<string, typeof files>();
  for (const file of files) fileByPurchase.set(file.purchaseId.toString(), [...(fileByPurchase.get(file.purchaseId.toString()) ?? []), file]);
  const productById = new Map(products.map((product) => [product._id.toString(), product]));
  const items = rows.map(({ purchase, purchaseCount }) => {
    const line = purchase.order.lines.find((item) => item._id?.equals(purchase.orderLineId));
    return {
      id: purchase._id.toString(), productId: purchase.productId.toString(), productSlug: line?.productSlug,
      orderId: purchase.orderId.toString(), orderReference: purchase.order.orderReference,
      productName: line?.productName ?? "PDF resource", productType: purchase.productType, entitlementType: purchase.entitlementType,
      grantedAt: purchase.grantedAt, purchaseCount, thumbnailRef: productById.get(purchase.productId.toString())?.imageRefs?.[0],
      files: (fileByPurchase.get(purchase._id.toString()) ?? []).map((file) => ({
        id: file._id.toString(), productId: file.productId.toString(),
        productName: line?.includedProducts.find((item) => item.productId.equals(file.productId))?.name ?? line?.productName ?? "PDF resource",
        sourceAssetVersion: file.sourceAssetVersion, status: file.status,
      })),
    };
  });
  const total = result?.total[0]?.value ?? 0;
  return { items, total, page, pageSize, pageCount: Math.ceil(total / pageSize) };
}

export async function listPurchaseFiles(purchaseIdValue: string, customerIdValue: string) {
  await connectToDatabase();
  const purchaseId = objectId(purchaseIdValue, "purchaseId");
  const userId = objectId(customerIdValue, "userId");
  const purchase = await PurchaseModel.findOne(ownedActiveDownloadPurchaseFilter(purchaseId, userId)).lean().exec();
  if (!purchase) throw new NotFoundError();
  await requireVerifiedPdfPurchase(purchaseId, userId);
  const files = await PersonalizedPdfModel.find({ purchaseId, userId }).sort({ createdAt: 1 }).lean().exec();
  return files.map((file) => ({ id: file._id.toString(), sourceAssetVersion: file.sourceAssetVersion, status: file.status }));
}

/** Recheck entitlement on every request and return only a current private personalized copy. */
export async function createPurchaseDownloadUrl(purchaseIdValue: string, pdfIdValue: string, customerIdValue: string) {
  await connectToDatabase();
  const purchaseId = objectId(purchaseIdValue, "purchaseId");
  const pdfId = objectId(pdfIdValue, "fileId");
  const userId = objectId(customerIdValue, "userId");
  const verified = await requireVerifiedPdfPurchase(purchaseId, userId);
  const file = await PersonalizedPdfModel.findOne(ownedPersonalizedPdfFilter(pdfId, purchaseId, userId)).lean().exec();
  if (!file || !matchesPurchasedPdf(verified.sources, file, purchaseId)) throw new NotFoundError();
  await enforceDownloadRateLimit({ userId, purchaseId, pdfId });
  if (file.status === "ready" && file.watermarkVersion !== PDF_WATERMARK_VERSION) {
    await PersonalizedPdfModel.updateOne({ _id: pdfId, purchaseId, userId, status: "ready", watermarkVersion: { $ne: PDF_WATERMARK_VERSION } }, { $set: { status: "failed", failureCode: "WATERMARK_VERSION_OUTDATED" } });
  }
  let current = await PersonalizedPdfModel.findOne({ _id: pdfId, purchaseId, userId, status: "ready", watermarkVersion: PDF_WATERMARK_VERSION }).lean().exec();
  if (!current) {
    await processPurchasePdfPersonalization(purchaseId.toString(), userId.toString());
    current = await PersonalizedPdfModel.findOne({ _id: pdfId, purchaseId, userId, status: "ready", watermarkVersion: PDF_WATERMARK_VERSION }).lean().exec();
  }
  if (!current) throw new NotFoundError();
  await requireVerifiedPdfPurchase(purchaseId, userId);
  let bytes: Uint8Array;
  try { bytes = await getR2Storage().getPrivatePdf(current.objectKey); }
  catch { throw new NotFoundError(); }
  if (bytes.byteLength > 20 * 1024 * 1024 || bytes.byteLength !== current.sizeBytes || createHash("sha256").update(bytes).digest("hex") !== current.sha256) throw new NotFoundError();
  await recordDownloadOutcome({ userId, purchaseId, pdfId, result: "issued" });
  return { bytes, filename: `moneytree-resource-${pdfId.toString()}.pdf` };
}

export async function enforceDownloadRateLimit(input: { userId: Types.ObjectId; purchaseId: Types.ObjectId; pdfId: Types.ObjectId; now?: Date }): Promise<void> {
  const now = input.now ?? new Date();
  const allowedMinute = await consumePerMinuteLimit(input.userId, now);
  const hourCount = await DownloadLogModel.countDocuments({ userId: input.userId, result: "issued", createdAt: { $gte: new Date(now.getTime() - 60 * 60 * 1000) } });
  if (!isDownloadRequestAllowed(allowedMinute, hourCount, PER_HOUR_LIMIT)) {
    await recordDownloadOutcome({ ...input, result: "rate_limited", failureCode: "DOWNLOAD_RATE_LIMIT" });
    throw new RateLimitError();
  }
}
