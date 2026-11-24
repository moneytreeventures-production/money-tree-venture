import "server-only";

import { randomUUID } from "node:crypto";
import type { ClientSession } from "mongoose";
import type { Order } from "../db/models/order";
import {
  AuditLogModel, BookingModel, OutboxEventModel, PersonalizedPdfModel, PurchaseModel,
  type PersonalizedPdf,
} from "../db/models";
import { createPrivatePdfObjectKey } from "../storage/validation";
import { pdfSourcesForOrderLine } from "./entitlement-policy";
import { buildOrderPurchaseConfirmationEvent } from "./purchase-confirmation-event";

/** Called inside the verified-payment MongoDB transaction; external storage work is deferred. */
export async function grantPaidOrderFulfillment(order: Order & { _id: import("mongoose").Types.ObjectId }, session: ClientSession): Promise<void> {
  for (const line of order.lines) {
    const callGuidance = line.productType === "call_guidance";
    const existingPurchase = await PurchaseModel.findOne({ orderLineId: line._id, orderId: order._id, userId: order.userId }).session(session).lean().exec();
    if (existingPurchase) {
      continue;
    }
    const purchase = new PurchaseModel({
      userId: order.userId,
      orderId: order._id,
      orderLineId: line._id,
      productId: line.productId,
      productType: line.productType,
      entitlementType: callGuidance ? "booking" : "download",
      bundleItems: line.productType === "pdf_bundle" ? line.includedProducts.map((item) => ({
        productId: item.productId,
        productName: item.name,
        productSlug: item.slug,
        assetId: item.asset.assetId,
        assetVersion: item.asset.version,
      })) : [],
      accessStatus: "active",
      grantedAt: order.paidAt ?? new Date(),
    });
    await purchase.save({ session });
    await AuditLogModel.create([{
      actorType: "system", action: "entitlement.granted", targetType: "purchase",
      targetId: purchase._id.toString(), changedFields: ["accessStatus", "entitlementType"],
      reason: `Verified payment for ${order.orderReference}.`,
    }], { session });

    if (callGuidance) {
      if (!line.callDurationMinutes || !line.fulfilmentInstructions) throw new Error("Call Guidance order snapshot is incomplete.");
      const bookingId = randomUUID();
      const [booking] = await BookingModel.create([{
        bookingReference: `MTVB-${bookingId.replaceAll("-", "").toUpperCase()}`,
        userId: order.userId, orderId: order._id, purchaseId: purchase._id, productId: line.productId,
        status: "awaiting_scheduling", requestedSlots: [],
        sessionDurationMinutes: line.callDurationMinutes,
        schedulingInstructions: line.fulfilmentInstructions,
      }], { session });
      if (!booking) throw new Error("Unable to create the booking record.");
      await AuditLogModel.create([{
        actorType: "system", action: "booking.created", targetType: "booking", targetId: booking._id.toString(),
        changedFields: ["status", "purchaseId", "orderId", "productId"], reason: `Verified Call Guidance purchase for ${order.orderReference}.`,
      }], { session });
      await OutboxEventModel.create([{
        eventType: "booking_confirmation", aggregateType: "booking", aggregateId: booking._id,
        dedupeKey: `booking-confirmation:${booking._id.toString()}`,
        payload: { userId: order.userId, orderId: order._id, purchaseId: purchase._id, bookingId: booking._id, orderReference: order.orderReference, bookingReference: booking.bookingReference },
        status: "pending", attemptCount: 0, nextAttemptAt: new Date(),
      }], { session });
      continue;
    }

    const sources = pdfSourcesForOrderLine(line);
    const personalizedPdfs: Array<Partial<PersonalizedPdf>> = sources.map((source) => ({
      purchaseId: purchase._id,
      userId: order.userId,
      productId: source.productId,
      sourceAssetId: source.assetId,
      sourceAssetVersion: source.version,
      objectKey: createPrivatePdfObjectKey("personalized", purchase._id.toString()),
      status: "pending",
    }));
    if (personalizedPdfs.length) await PersonalizedPdfModel.create(personalizedPdfs, { session });
    const productIds = [...new Map(sources.map((source) => [source.productId.toString(), source.productId])).values()];
    await OutboxEventModel.create([{
      eventType: "pdf_personalization", aggregateType: "purchase", aggregateId: purchase._id,
      dedupeKey: `pdf-personalization:${purchase._id.toString()}`,
      payload: { userId: order.userId, orderId: order._id, purchaseId: purchase._id, productIds, orderReference: order.orderReference },
      status: "pending", attemptCount: 0, nextAttemptAt: new Date(),
    }], { session });
  }

  // Confirmation belongs to the verified order, not to each product entitlement.
  const confirmationKey = `purchase-confirmation:${order._id.toString()}`;
  const existingConfirmation = await OutboxEventModel.findOne({ dedupeKey: confirmationKey }).session(session).select("_id").lean().exec();
  if (!existingConfirmation) {
    await OutboxEventModel.create([buildOrderPurchaseConfirmationEvent(order)], { session });
  }
}
