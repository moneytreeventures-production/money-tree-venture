import "server-only";
import mongoose, { Types } from "mongoose";
import { connectToDatabase } from "../db/mongodb";
import { BookingModel, OrderModel, PaymentModel, CouponRedemptionModel, PurchaseModel, RefundModel, OutboxEventModel, WebhookEventModel, AuditLogModel } from "../db/models";
import { expireOrderIfSettled } from "./order-service";
import { getVerifiedPaymentStatus } from "../payments/cashfree/payment-service";
import { getCashfreeConfiguration } from "../payments/cashfree/config";

/** Fail closed: payment-bearing orders are retained indefinitely by this initial policy. */
export function retentionEligible(order: { orderStatus: string; paymentStatus: string; paidAt?: unknown; gatewayEnvironment: string; updatedAt?: Date }, cutoff: Date): boolean {
  return order.gatewayEnvironment === "sandbox" && order.orderStatus === "expired" &&
    ["unpaid", "failed"].includes(order.paymentStatus) && !order.paidAt &&
    order.updatedAt instanceof Date && order.updatedAt <= cutoff;
}

export async function maintainOrders(options: { mode: "expire" | "purge" | "reconcile"; database: string; dryRun?: boolean; limit?: number; retentionDays?: number }) {
  const dryRun = options.dryRun !== false;
  const limit = options.limit ?? 10;
  const days = options.retentionDays ?? 30;
  if (!Number.isInteger(limit) || limit < 1 || limit > 25 || !Number.isInteger(days) || days < 1) throw new Error("Invalid maintenance bounds");
  if (options.mode === "purge" && !dryRun) throw new Error("Permanent order deletion is disabled pending the owner's revised retention decision.");
  await connectToDatabase();
  if (mongoose.connection.name !== options.database) throw new Error("Database confirmation mismatch");
  const cutoff = new Date(Date.now() - days * 86400000);
  const counts = { scanned: 0, eligible: 0, processed: 0, preserved: 0, failed: 0 };
  const query = options.mode === "reconcile"
    ? { gatewayEnvironment: getCashfreeConfiguration().environment, orderStatus: "awaiting_payment", paymentStatus: { $in: ["pending", "failed"] } } as const
    : options.mode === "expire"
    ? { orderStatus: "awaiting_payment", expiresAt: { $lte: new Date() } } as const
    : { gatewayEnvironment: "sandbox", orderStatus: "expired", paymentStatus: { $in: ["unpaid", "failed"] }, paidAt: { $exists: false }, updatedAt: { $lte: cutoff } } as const;
  const cursorCollection = mongoose.connection.collection<{ _id: string; afterId?: Types.ObjectId }>("orderMaintenanceCursors");
  const previous = await cursorCollection.findOne({ _id: options.mode });
  const afterId = previous?.afterId instanceof Types.ObjectId ? previous.afterId : undefined;
  const pageQuery = { ...query, ...(afterId ? { _id: { $gt: afterId } } : {}) };
  const candidates = await OrderModel.find(pageQuery).sort({ _id: 1 }).limit(limit).lean();
  for (const candidate of candidates) {
    counts.scanned++;
    try {
      if (options.mode === "reconcile") {
        if (dryRun) { counts.preserved++; continue; }
        if (!await PaymentModel.exists({ orderId: candidate._id, userId: candidate.userId, cashfreeOrderId: { $type: "string" } })) {
          counts.preserved++;
          continue;
        }
        await getVerifiedPaymentStatus(candidate._id.toString(), candidate.userId.toString());
        await expireOrderIfSettled(candidate._id, candidate.userId);
        counts.processed++;
        continue;
      }
      if (options.mode === "expire") {
        if (dryRun) { counts.preserved++; continue; }
        if (await PaymentModel.exists({ orderId: candidate._id })) await getVerifiedPaymentStatus(candidate._id.toString(), candidate.userId.toString());
        await expireOrderIfSettled(candidate._id, candidate.userId);
        const result = await OrderModel.findById(candidate._id).lean();
        if (result?.orderStatus === "expired") counts.processed++; else counts.preserved++;
        continue;
      }
      const session = await mongoose.connection.startSession();
      let deleted = false;
      let eligible = false;
      try {
        await session.withTransaction(async () => {
          deleted = false; eligible = false;
          const order = await OrderModel.findById(candidate._id).session(session).lean();
          if (!order || !retentionEligible(order, cutoff)) return;
          if (!await AuditLogModel.exists({ targetType: "order", targetId: order._id.toString(), action: "order.payment_window_expired", createdAt: { $lte: cutoff } }).session(session)) return;
          // Preserve all dependent records; no cascading deletion of financial history.
          for (const model of [PaymentModel, CouponRedemptionModel, PurchaseModel, BookingModel, RefundModel, WebhookEventModel]) {
            if (await model.collection.findOne({ orderId: order._id }, { session, projection: { _id: 1 } })) return;
          }
          if (await OutboxEventModel.exists({ $or: [{ aggregateId: order._id }, { "payload.orderId": order._id }] }).session(session)) return;
          eligible = true;
          if (dryRun) return;
          const result = await OrderModel.deleteOne({ _id: order._id, orderStatus: "expired", paymentStatus: order.paymentStatus, updatedAt: order.updatedAt, paidAt: { $exists: false } }, { session });
          if (result.deletedCount !== 1) return;
          await AuditLogModel.create([{ actorType: "system", action: "order.abandoned_purged", targetType: "order", targetId: order._id.toString(), changedFields: [], reason: "Sandbox retention cleanup; no financial or entitlement dependents. Prior audit events remain as tombstones." }], { session });
          deleted = true;
        });
      } finally { await session.endSession(); }
      if (eligible) counts.eligible++;
      if (deleted) counts.processed++; else counts.preserved++;
    } catch { counts.failed++; }
  }
  if (!dryRun) {
    const expected = previous?.afterId instanceof Types.ObjectId ? previous.afterId : { $exists: false };
    const next = candidates.length ? candidates[candidates.length - 1]._id : undefined;
    await cursorCollection.updateOne({ _id: options.mode, afterId: expected },
      next ? { $set: { afterId: next } } : { $unset: { afterId: "" } }, { upsert: !previous });
  }
  return counts;
}
