import "server-only";
import { Types } from "mongoose";
import { OrderModel, PaymentModel, PurchaseModel } from "../db/models";
import { NotFoundError } from "../errors/app-error";
import { activePaidOrderFilter, ownedActiveDownloadPurchaseFilter, pdfSourcesForOrderLine } from "./entitlement-policy";

export async function requireVerifiedPdfPurchase(purchaseId: Types.ObjectId, userId: Types.ObjectId) {
  const purchase = await PurchaseModel.findOne(ownedActiveDownloadPurchaseFilter(purchaseId, userId)).lean();
  if (!purchase) throw new NotFoundError();
  const order = await OrderModel.findOne({ _id: purchase.orderId, userId, ...activePaidOrderFilter() }).lean();
  if (!order) throw new NotFoundError();
  const payment = await PaymentModel.exists({ orderId: order._id, userId, status: "success", providerStatus: "SUCCESS", gatewayEnvironment: order.gatewayEnvironment, amountPaise: order.totalPaise, currency: "INR", cashfreeOrderId: { $type: "string" }, cashfreePaymentId: { $type: "string" } });
  const line = order.lines.find((item) => item._id?.equals(purchase.orderLineId) && item.productId.equals(purchase.productId));
  if (!payment || !line) throw new NotFoundError();
  return { purchase, order, sources: pdfSourcesForOrderLine(line) };
}

export function matchesPurchasedPdf(sources: Array<{ productId: Types.ObjectId; assetId: Types.ObjectId; version: string }>, file: { productId: Types.ObjectId; sourceAssetId: Types.ObjectId; sourceAssetVersion: string; objectKey: string }, purchaseId: Types.ObjectId): boolean {
  return file.objectKey.startsWith(`personalized/${purchaseId.toString()}/`) && sources.some((source) => source.productId.equals(file.productId) && source.assetId.equals(file.sourceAssetId) && source.version === file.sourceAssetVersion);
}
