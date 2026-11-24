import "server-only";

import { randomUUID } from "node:crypto";
import mongoose, { Types } from "mongoose";
import { z } from "zod";
import { connectToDatabase } from "../../db/mongodb";
import {
  AuditLogModel, BookingModel, CheckoutClaimModel, OrderModel, OutboxEventModel, PaymentModel, PurchaseModel, RefundModel, WebhookEventModel,
  type Refund,
} from "../../db/models";
import { ConflictError, NotFoundError, ValidationError } from "../../errors/app-error";
import { getCashfreeClient, type CashfreeGateway, type CashfreeRefundResult } from "./client";
import { getCashfreeConfiguration } from "./config";
import { persistOrderLifecycleChanges, type ExpectedOrderLifecycle, type OrderLifecycleChanges } from "../../checkout/order-state-persistence";

const refundRequestSchema = z.object({ reason: z.string().trim().min(3).max(100) }).strict();

function objectId(value: string, field: string): Types.ObjectId {
  if (!/^[a-f0-9]{24}$/i.test(value)) throw new ValidationError([{ field, message: "This reference is invalid." }]);
  return new Types.ObjectId(value);
}

function refundView(refund: Refund & { _id: Types.ObjectId }) {
  return {
    id: refund._id.toString(), refundId: refund.refundId, orderId: refund.orderId.toString(),
    amountPaise: refund.amountPaise, currency: refund.currency, status: refund.status,
    providerStatus: refund.providerStatus, requestedAt: refund.requestedAt, processedAt: refund.processedAt,
  };
}

export function shouldStartNewFullRefundAttempt(status?: Refund["status"]): boolean {
  return status === undefined || status === "failed";
}

export function shouldRestorePaidOrderAfterRefundFailure(orderStatus: string, refundId: string, latestRefundId?: string): boolean {
  return orderStatus === "partially_refunded" && latestRefundId === refundId;
}

/** Creates or resumes one idempotent full-order refund. Entitlements change only after Cashfree confirms success. */
export async function requestFullCashfreeRefund(
  orderIdValue: string,
  adminIdValue: string,
  input: unknown,
  gateway: CashfreeGateway = getCashfreeClient(),
) {
  const orderId = objectId(orderIdValue, "orderId");
  const adminId = objectId(adminIdValue, "adminId");
  const parsed = refundRequestSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.issues.map((issue) => ({ field: issue.path.map(String).join("."), message: issue.message })));
  const configuredEnvironment = getCashfreeConfiguration().environment;
  await connectToDatabase();

  const existing = await RefundModel.findOne({ orderId }).sort({ createdAt: -1, _id: -1 }).lean().exec() as unknown as (Refund & { _id: Types.ObjectId }) | null;
  let refund = existing && !shouldStartNewFullRefundAttempt(existing.status) ? existing : null;
  if (!refund) {
    const session = await mongoose.connection.getClient().startSession();
    try {
      await session.withTransaction(async () => {
        const prior = await RefundModel.findOne({ orderId }).sort({ createdAt: -1, _id: -1 }).session(session).lean().exec();
        if (prior && !shouldStartNewFullRefundAttempt(prior.status)) { refund = prior as unknown as Refund & { _id: Types.ObjectId }; return; }
        const order = await OrderModel.findOneAndUpdate(
          { _id: orderId, gatewayEnvironment: configuredEnvironment, orderStatus: "paid", paymentStatus: "paid" },
          { $set: { orderStatus: "partially_refunded", paymentStatus: "partially_refunded" } },
          { session, returnDocument: "after" },
        );
        if (!order?.paidAt || !order.userId) throw new NotFoundError();
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        if (order.paidAt < sixMonthsAgo) throw new ConflictError();
        const successfulPaymentCount = await PaymentModel.countDocuments({ orderId, userId: order.userId, status: "success" }).session(session);
        if (successfulPaymentCount !== 1) throw new ConflictError();
        const payment = await PaymentModel.findOne({ orderId, userId: order.userId, status: "success", cashfreeOrderId: { $type: "string" }, cashfreePaymentId: { $type: "string" } })
          .sort({ paidAt: 1 }).session(session).exec();
        if (!payment?.cashfreeOrderId || !payment.cashfreePaymentId || payment.gatewayEnvironment !== order.gatewayEnvironment) throw new ConflictError();
        const refundId = `MTVR${randomUUID().replaceAll("-", "").toUpperCase()}`;
        const [created] = await RefundModel.create([{
          orderId, paymentId: payment._id, userId: order.userId, adminUserId: adminId,
          gatewayEnvironment: order.gatewayEnvironment,
          cashfreeOrderId: payment.cashfreeOrderId, cashfreePaymentId: payment.cashfreePaymentId,
          refundId, idempotencyKey: randomUUID(), amountPaise: order.totalPaise, currency: "INR",
          reason: parsed.data.reason, status: "processing", requestedAt: new Date(),
        }], { session });
        if (!created) throw new ConflictError();
        await AuditLogModel.create([{
          actorType: "admin", actorUserId: adminId, action: "refund.requested", targetType: "refund",
          targetId: created._id.toString(), changedFields: ["status", "amountPaise"], reason: parsed.data.reason,
        }], { session });
        refund = created as unknown as Refund & { _id: Types.ObjectId };
      });
    } finally {
      await session.endSession();
    }
  }

  if (!refund) throw new ConflictError();
  if (refund.status === "success" || refund.status === "failed") return refundView(refund);
  if (getCashfreeConfiguration().environment !== refund.gatewayEnvironment) throw new ConflictError();

  if (refund.idempotencyKey) {
    const created = await gateway.createRefund({
      orderId: refund.cashfreeOrderId,
      refundId: refund.refundId,
      idempotencyKey: refund.idempotencyKey,
      amountPaise: refund.amountPaise,
      reason: refund.reason,
    });
    assertCashfreeRefundMatches(refund, created);
  }
  const verified = await gateway.fetchRefund(refund.cashfreeOrderId, refund.refundId);
  assertCashfreeRefundMatches(refund, verified);
  await applyVerifiedCashfreeRefund(refund.refundId, verified);
  const updated = await RefundModel.findOne({ _id: refund._id }).lean().exec() as unknown as (Refund & { _id: Types.ObjectId }) | null;
  if (!updated) throw new ConflictError();
  return refundView(updated);
}

export function assertCashfreeRefundMatches(refund: Pick<Refund, "cashfreeOrderId" | "cashfreePaymentId" | "refundId" | "amountPaise">, provider: CashfreeRefundResult): void {
  if (provider.orderId !== refund.cashfreeOrderId || provider.paymentId !== refund.cashfreePaymentId ||
    provider.refundId !== refund.refundId || provider.amountPaise !== refund.amountPaise || provider.currency !== "INR") {
    throw new ConflictError();
  }
}

export function classifyCashfreeRefundStatus(statusValue: string): Refund["status"] {
  const status = statusValue.toUpperCase();
  if (status === "SUCCESS") return "success";
  if (["CANCELLED", "REJECTED", "FAILED"].includes(status)) return "failed";
  return "pending";
}

export interface VerifiedRefundWebhook {
  providerEventId: string; eventType: string; payloadDigest: string; cashfreeOrderId: string; cashfreeRefundId: string;
  gatewayEnvironment: "sandbox" | "production";
}

export async function applyVerifiedCashfreeRefund(
  merchantRefundId: string,
  provider: CashfreeRefundResult,
  webhookEvent?: VerifiedRefundWebhook,
): Promise<{ matched: boolean; duplicate?: boolean }> {
  await connectToDatabase();
  const session = await mongoose.connection.getClient().startSession();
  let matched = false;
  try {
    await session.withTransaction(async () => {
      if (webhookEvent && await WebhookEventModel.exists({ provider: "cashfree", providerEventId: webhookEvent.providerEventId }).session(session)) {
        matched = true;
        return;
      }
      let refund = await RefundModel.findOne({ refundId: merchantRefundId, cashfreeOrderId: provider.orderId }).session(session);
      if (!refund) {
        if (webhookEvent && provider.currency === "INR") {
          const payment = await PaymentModel.findOne({
            cashfreeOrderId: provider.orderId, cashfreePaymentId: provider.paymentId, status: "success",
            gatewayEnvironment: webhookEvent.gatewayEnvironment,
          }).session(session);
          const order = payment ? await OrderModel.findOne({ _id: payment.orderId, userId: payment.userId, orderStatus: "paid", paymentStatus: "paid" }).session(session) : null;
          const successfulPaymentCount = order ? await PaymentModel.countDocuments({ orderId: order._id, userId: order.userId, status: "success" }).session(session) : 0;
          if (payment && order && successfulPaymentCount === 1 && order.totalPaise === provider.amountPaise) {
            const expected: ExpectedOrderLifecycle = { orderStatus: order.orderStatus, paymentStatus: order.paymentStatus, ...(order.updatedAt ? { updatedAt: order.updatedAt } : {}) };
            order.orderStatus = "partially_refunded";
            order.paymentStatus = "partially_refunded";
            await persistOrderLifecycleChanges({ orderId: order._id, userId: order.userId, session, expected, changes: { orderStatus: "partially_refunded", paymentStatus: "partially_refunded" } });
            const [externalRefund] = await RefundModel.create([{
              orderId: order._id, paymentId: payment._id, userId: order.userId,
              gatewayEnvironment: payment.gatewayEnvironment, cashfreeOrderId: provider.orderId,
              cashfreePaymentId: provider.paymentId, refundId: merchantRefundId,
              amountPaise: order.totalPaise, currency: "INR",
              reason: "Cashfree-initiated full refund", status: "processing", cashfreeRefundId: provider.providerRefundId,
              requestedAt: new Date(),
            }], { session });
            if (!externalRefund) throw new ConflictError();
            refund = externalRefund;
            await AuditLogModel.create([{
              actorType: "system", action: "refund.observed_externally", targetType: "order", targetId: order._id.toString(),
              changedFields: ["orderStatus", "paymentStatus"], reason: `Full Cashfree refund ${merchantRefundId} arrived by webhook.`,
            }], { session });
          }
        }
        if (!refund) {
          if (webhookEvent) await WebhookEventModel.create([{
            provider: "cashfree", providerEventId: webhookEvent.providerEventId, eventType: webhookEvent.eventType,
            cashfreeOrderId: webhookEvent.cashfreeOrderId, cashfreeRefundId: webhookEvent.cashfreeRefundId,
            payloadDigest: webhookEvent.payloadDigest, processingStatus: "dead_letter", receivedAt: new Date(), processedAt: new Date(),
            errorCode: "REFUND_RECONCILIATION_REQUIRED", errorSummary: "Verified refund event did not match a single full paid order.",
          }], { session });
          return;
        }
      }
      assertCashfreeRefundMatches(refund, provider);
      if (webhookEvent && (webhookEvent.cashfreeOrderId !== refund.cashfreeOrderId || webhookEvent.cashfreeRefundId !== provider.providerRefundId)) {
        throw new ConflictError();
      }
      if (webhookEvent) await WebhookEventModel.create([{
        provider: "cashfree", providerEventId: webhookEvent.providerEventId, eventType: webhookEvent.eventType,
        orderId: refund.orderId, refundId: refund._id, cashfreeOrderId: refund.cashfreeOrderId,
        cashfreeRefundId: provider.providerRefundId, payloadDigest: webhookEvent.payloadDigest,
        processingStatus: "processed", receivedAt: new Date(), processedAt: new Date(),
      }], { session });
      matched = true;

      if (refund.status === "success") return;
      const status = provider.status.toUpperCase();
      const resolvedStatus = classifyCashfreeRefundStatus(status);
      if (refund.status === "failed" && resolvedStatus !== "success") return;
      const order = await OrderModel.findById(refund.orderId).session(session);
      if (!order) throw new NotFoundError();
      const expected: ExpectedOrderLifecycle = { orderStatus: order.orderStatus, paymentStatus: order.paymentStatus, ...(order.updatedAt ? { updatedAt: order.updatedAt } : {}) };
      const previousRefundedAt = order.refundedAt;
      refund.cashfreeRefundId = provider.providerRefundId;
      refund.providerStatus = status.slice(0, 64);
      if (resolvedStatus === "success") {
        refund.status = "success";
        refund.processedAt = new Date();
        order.orderStatus = "refunded";
        order.paymentStatus = "refunded";
        order.refundedAt = refund.processedAt;
        const purchases = await PurchaseModel.find({ orderId: order._id, userId: order.userId, accessStatus: "active" }).session(session).exec();
        for (const purchase of purchases) {
          purchase.accessStatus = "revoked";
          purchase.revokedAt = refund.processedAt;
          purchase.revocationReason = `Full Cashfree refund ${refund.refundId}.`;
          const [audit] = await AuditLogModel.create([{
            actorType: "system", action: "entitlement.revoked", targetType: "purchase", targetId: purchase._id.toString(),
            changedFields: ["accessStatus", "revokedAt", "revocationReason"], reason: `Full refund ${refund.refundId} succeeded.`,
          }], { session });
          if (!audit) throw new ConflictError();
          purchase.revocationAuditId = audit._id;
          await purchase.save({ session });
          if (purchase.entitlementType === "booking") {
            const booking = await BookingModel.findOne({ purchaseId: purchase._id, status: { $in: ["awaiting_scheduling", "scheduled"] } }).session(session);
            if (booking) {
              booking.status = "cancelled";
              booking.cancelledAt = refund.processedAt;
              booking.cancellationReason = `Purchase refunded (${refund.refundId}).`;
              await booking.save({ session });
              await AuditLogModel.create([{
                actorType: "system", action: "booking.cancelled_refund", targetType: "booking", targetId: booking._id.toString(),
                changedFields: ["status", "cancelledAt", "cancellationReason"], reason: `Full refund ${refund.refundId} succeeded.`,
              }], { session });
              await OutboxEventModel.create([{
                eventType: "booking_status", aggregateType: "booking", aggregateId: booking._id,
                dedupeKey: `refund-booking-status:${refund._id.toString()}:${booking._id.toString()}`,
                payload: { userId: booking.userId, orderId: booking.orderId, purchaseId: booking.purchaseId, bookingId: booking._id },
                status: "pending", attemptCount: 0, nextAttemptAt: new Date(),
              }], { session });
            }
          }
        }
        await AuditLogModel.create([{
          actorType: "system", action: "refund.succeeded", targetType: "order", targetId: order._id.toString(),
          changedFields: ["orderStatus", "paymentStatus", "refundedAt"], reason: `Cashfree refund ${refund.refundId} succeeded.`,
        }], { session });
        await OutboxEventModel.create([{
          eventType: "refund_confirmation", aggregateType: "order", aggregateId: order._id,
          dedupeKey: `refund-confirmation:${refund._id.toString()}`,
          payload: { userId: order.userId, orderId: order._id, refundId: refund._id },
          status: "pending", attemptCount: 0, nextAttemptAt: new Date(),
        }], { session });
      } else if (resolvedStatus === "failed") {
        refund.status = "failed";
        refund.processedAt = new Date();
        const latestAttempt = await RefundModel.findOne({ orderId: order._id }).sort({ createdAt: -1, _id: -1 })
          .select("_id").session(session).lean().exec() as { _id: Types.ObjectId } | null;
        if (shouldRestorePaidOrderAfterRefundFailure(order.orderStatus, refund._id.toString(), latestAttempt?._id.toString())) {
          order.orderStatus = "paid";
          order.paymentStatus = "paid";
        }
        await AuditLogModel.create([{
          actorType: "system", action: "refund.failed", targetType: "order", targetId: order._id.toString(),
          changedFields: ["orderStatus", "paymentStatus"], reason: `Cashfree refund ${refund.refundId} ended as ${status}.`,
        }], { session });
      } else {
        refund.status = "pending";
      }
      await refund.save({ session });
      const orderChanges: OrderLifecycleChanges = {};
      if (order.orderStatus !== expected.orderStatus) orderChanges.orderStatus = order.orderStatus;
      if (order.paymentStatus !== expected.paymentStatus) orderChanges.paymentStatus = order.paymentStatus;
      if (order.refundedAt && order.refundedAt.getTime() !== previousRefundedAt?.getTime()) orderChanges.refundedAt = order.refundedAt;
      if (Object.keys(orderChanges).length) await persistOrderLifecycleChanges({ orderId: order._id, userId: order.userId, session, expected, changes: orderChanges });
      if (order.orderStatus === "refunded" && !await PaymentModel.exists({ orderId: order._id, userId: order.userId, status: "pending" }).session(session)) {
        await CheckoutClaimModel.updateMany({ orderId: order._id, userId: order.userId, status: { $in: ["active", "completed"] } }, { $set: { status: "refunded", releasedAt: new Date() } }, { session });
      }
    });
  } finally {
    await session.endSession();
  }
  return { matched };
}
