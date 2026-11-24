import "server-only";

import { createHash, randomUUID } from "node:crypto";
import mongoose, { Types, type ClientSession } from "mongoose";
import { connectToDatabase } from "../../db/mongodb";
import { AuditLogModel, CheckoutClaimModel, CouponModel, CouponRedemptionModel, OrderModel, PaymentModel, WebhookEventModel, type Payment } from "../../db/models";
import { ConflictError, IntegrationConfigurationError, NotFoundError, ValidationError } from "../../errors/app-error";
import { getCashfreeClient, type CashfreeCreateOrderInput, type CashfreeGateway, type CashfreeOrderResult } from "./client";
import { cashfreeReturnUrlFromBase, cashfreeWebhookUrlFromReturnUrl, getCashfreeConfiguration } from "./config";
import { toCustomerOrderView } from "../../checkout/order-service";
import { grantPaidOrderFulfillment } from "../../fulfillment/purchase-fulfillment";
import { canFinalizeVerifiedExpiredOrder, canInitiatePaymentForOrder, canReusePendingPaymentAttempt, classifyVerifiedOrderPayment, isOwnerHeldHistoricalRecovery } from "./order-payment-state";
import { normalizeIndianMobilePhone } from "./mobile-phone";
import { logger } from "../../logger";
import { paymentSnapshotIssues } from "../../checkout/payment-snapshot-validation";
import { persistOrderLifecycleChanges, type ExpectedOrderLifecycle, type OrderLifecycleChanges } from "../../checkout/order-state-persistence";

export { isRefundLockedPaymentState } from "./order-payment-state";

function assertObjectId(value: string, field: string): Types.ObjectId {
  if (!/^[a-f0-9]{24}$/i.test(value)) throw new ValidationError([{ field, message: "This reference is invalid." }]);
  return new Types.ObjectId(value);
}

function duplicateKey(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
}

function requestHash(orderId: Types.ObjectId, userId: Types.ObjectId, phone: string, amountPaise: number): string {
  return createHash("sha256").update(`${orderId}:${userId}:${phone}:${amountPaise}`).digest("hex");
}

/** A lost Create Order response may still represent a created provider order. */
export async function createOrRecoverCashfreeOrder(
  gateway: Pick<CashfreeGateway, "createOrder" | "fetchOrder">,
  input: CashfreeCreateOrderInput,
): Promise<CashfreeOrderResult & { paymentSessionId: string }> {
  let result: CashfreeOrderResult;
  try {
    result = await gateway.createOrder(input);
  } catch (createError) {
    try {
      result = await gateway.fetchOrder(input.orderId);
    } catch {
      // Keep the original failure. A later retry uses the same stored provider
      // order ID and idempotency key; it never allocates a second attempt here.
      throw createError;
    }
  }
  if (result.orderId !== input.orderId || result.amountPaise !== input.amountPaise ||
    result.currency !== input.currency || result.status !== "ACTIVE" || !result.paymentSessionId) {
    throw new ConflictError("The Cashfree checkout session is unavailable or does not match this order. Check payment status before retrying.");
  }
  return { ...result, paymentSessionId: result.paymentSessionId };
}

type ExpectedPaymentLifecycle = Pick<Payment, "status"> & {
  updatedAt?: Date; cashfreePaymentId?: string; providerStatus?: string;
};

function capturePaymentLifecycle(payment: InstanceType<typeof PaymentModel>): ExpectedPaymentLifecycle {
  return {
    status: payment.status,
    ...(payment.updatedAt ? { updatedAt: payment.updatedAt } : {}),
    ...(payment.cashfreePaymentId ? { cashfreePaymentId: payment.cashfreePaymentId } : {}),
    ...(payment.providerStatus ? { providerStatus: payment.providerStatus } : {}),
  };
}

async function persistPaymentLifecycle(payment: InstanceType<typeof PaymentModel>, expected: ExpectedPaymentLifecycle, session: ClientSession) {
  const allowed = ["cashfreePaymentId", "status", "providerStatus", "failureCode", "failureSummary", "paidAt", "lastEventAt"] as const;
  const changes: Partial<Pick<Payment, typeof allowed[number]>> = {};
  for (const path of allowed) {
    if (payment.isModified(path)) Object.assign(changes, { [path]: payment.get(path) });
  }
  if (Object.keys(changes).length === 0) return;
  const result = await PaymentModel.updateOne({
    _id: payment._id, orderId: payment.orderId, userId: payment.userId,
    cashfreeOrderId: payment.cashfreeOrderId,
    status: expected.status,
    ...(expected.updatedAt ? { updatedAt: expected.updatedAt } : {}),
    cashfreePaymentId: expected.cashfreePaymentId === undefined ? { $exists: false } : expected.cashfreePaymentId,
    providerStatus: expected.providerStatus === undefined ? { $exists: false } : expected.providerStatus,
  }, { $set: changes }, { session, runValidators: true });
  if (result.matchedCount !== 1) throw new ConflictError("Payment status changed during reconciliation. Check the status again.");
}

/** Create/reuse a server-side Cashfree order and return its Hosted Checkout session. */
export async function createCashfreePayment(
  orderIdValue: string,
  customerIdValue: string,
  input: unknown,
  idempotencyKey: string,
  gateway?: CashfreeGateway,
  requestId?: string,
) {
  const orderId = assertObjectId(orderIdValue, "orderId");
  const userId = assertObjectId(customerIdValue, "userId");
  const parsed = normalizeIndianMobilePhone(typeof input === "object" && input !== null && "phone" in input ? input.phone : undefined);
  if (!parsed) throw new ValidationError([{ field: "phone", message: "Please enter a valid 10-digit mobile number." }]);
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey)) throw new ValidationError([{ field: "idempotencyKey", message: "A valid payment attempt key is required." }]);
  await connectToDatabase();
  const order = await OrderModel.findOne({ _id: orderId, userId });
  if (!order) throw new NotFoundError();
  if (!canInitiatePaymentForOrder(order, new Date())) {
    throw new ConflictError();
  }
  if (order.totalPaise < 100) throw new ValidationError([{ field: "order", message: "The order total must be at least ₹1 for Cashfree checkout." }]);

  const config = getCashfreeConfiguration();
  const cashfreeGateway = gateway ?? getCashfreeClient();
  if (config.environment !== order.gatewayEnvironment) throw new IntegrationConfigurationError("Cashfree", ["CASHFREE_ENVIRONMENT"]);
  const hash = requestHash(orderId, userId, parsed, order.totalPaise);
  let payment = await PaymentModel.findOne({ userId, orderId, checkoutRequestKey: idempotencyKey }).select("+attemptRequestHash");
  if (!payment) {
    const activeAttempt = await PaymentModel.findOne({ userId, orderId, status: "pending", checkoutRequestKey: { $type: "string" } }).select("+attemptRequestHash");
    if (activeAttempt) {
      if (!canReusePendingPaymentAttempt({ status: activeAttempt.status, storedRequestHash: activeAttempt.attemptRequestHash, requestedHash: hash })) {
        throw new ConflictError("A payment attempt is still processing. Check its status before changing details or retrying.");
      }
      payment = activeAttempt;
    }
  }

  if (payment && payment.attemptRequestHash !== hash) throw new ConflictError();
  if (!payment && order.paymentStatus === "pending") throw new ConflictError("The existing payment attempt is still being confirmed. Check its status before trying again.");
  if (!payment) {
    const session = await mongoose.connection.getClient().startSession();
    try {
      await session.withTransaction(async () => {
        const currentOrder = await OrderModel.findOne({ _id: orderId, userId }).session(session);
        if (!currentOrder || !canInitiatePaymentForOrder(currentOrder, new Date())) {
          throw new ConflictError();
        }
        const activeAttempt = await PaymentModel.findOne({ userId, orderId, status: "pending", checkoutRequestKey: { $type: "string" } })
          .select("+attemptRequestHash").session(session);
        if (activeAttempt) {
          if (!canReusePendingPaymentAttempt({ status: activeAttempt.status, storedRequestHash: activeAttempt.attemptRequestHash, requestedHash: hash })) {
            throw new ConflictError("A payment attempt is still processing. Check its status before changing details or retrying.");
          }
          payment = activeAttempt;
          return;
        }
        if (currentOrder.paymentStatus === "pending") throw new ConflictError("The existing payment attempt is still being confirmed. Check its status before trying again.");
        const attemptId = randomUUID();
        const cashfreeOrderId = `MTVP-${attemptId.replaceAll("-", "")}`;
        const gatewayIdempotencyKey = randomUUID();
        const [created] = await PaymentModel.create([{
          paymentReference: `PAY-${attemptId}`,
          orderId, userId, gatewayEnvironment: config.environment,
          checkoutRequestKey: idempotencyKey, gatewayIdempotencyKey, attemptRequestHash: hash,
          cashfreeOrderId, amountPaise: currentOrder.totalPaise, currency: "INR", status: "pending",
        }], { session });
        if (!created) throw new ConflictError();
        // Validate persisted financial values without assigning or invalidating
        // immutable paths on a hydrated Mongoose document.
        const snapshotIssues = paymentSnapshotIssues(currentOrder.toObject({ depopulate: true }));
        if (snapshotIssues.length) {
          logger.error("cashfree.payment_order_snapshot_invalid", { requestId, stage: "order_snapshot_validation", operation: "paymentSnapshotIssues", paths: snapshotIssues });
          throw new ValidationError(snapshotIssues.map((field) => ({ field, message: "The stored order snapshot is invalid." })));
        }
        let updatedOrder;
        try {
          updatedOrder = await OrderModel.updateOne({
            _id: orderId, userId, orderStatus: "awaiting_payment", paymentStatus: currentOrder.paymentStatus,
            expiresAt: { $gt: new Date() },
          }, { $set: { paymentStatus: "pending" } }, { session, runValidators: true });
        } catch (error) {
          logPaymentValidationFailure(error, "order_paymentStatus_updateOne", requestId, currentOrder);
          throw error;
        }
        if (updatedOrder.matchedCount !== 1) throw new ConflictError();
        logger.info("cashfree.payment_order_status_updated", {
          requestId,
          stage: "order_paymentStatus_updateOne",
          operation: "OrderModel.updateOne",
          matchedCount: updatedOrder.matchedCount,
          hydrated: !currentOrder.isNew,
          modifiedPaths: currentOrder.modifiedPaths().filter((path) => !/customer|email|phone/i.test(path)).slice(0, 30),
          financialSnapshotModified: ["discountPaise", "taxPaise", "currency"].some((path) => currentOrder.isModified(path)),
        });
        payment = created;
      });
    } catch (error) {
      if (!duplicateKey(error)) throw error;
      payment = await PaymentModel.findOne({ userId, orderId, checkoutRequestKey: idempotencyKey }).select("+attemptRequestHash");
      if (!payment) payment = await PaymentModel.findOne({ userId, orderId, status: "pending", checkoutRequestKey: { $type: "string" } }).select("+attemptRequestHash");
      if (!payment || payment.attemptRequestHash !== hash) throw new ConflictError(error);
    } finally {
      await session.endSession();
    }
  }

  if (!payment?.cashfreeOrderId || !payment.gatewayIdempotencyKey) throw new ConflictError();
  if (payment.status === "success") throw new ConflictError();
  if (!order.expiresAt) throw new ConflictError();
  const notifyUrl = cashfreeWebhookUrlFromReturnUrl(config.returnUrlBase);
  const result = await createOrRecoverCashfreeOrder(cashfreeGateway, {
    orderId: payment.cashfreeOrderId,
    idempotencyKey: payment.gatewayIdempotencyKey,
    amountPaise: order.totalPaise,
    currency: "INR",
    customer: { customerId: userId.toString(), name: order.customerSnapshot.name, email: order.customerSnapshot.email, phone: parsed },
    returnUrl: cashfreeReturnUrlFromBase(config.returnUrlBase, payment.cashfreeOrderId),
    ...(notifyUrl ? { notifyUrl } : {}),
    expiresAt: order.expiresAt,
  });
  await PaymentModel.updateOne({ _id: payment._id, userId, orderId }, { $set: { providerStatus: result.status, providerReference: result.gatewayOrderId } });
  return { paymentSessionId: result.paymentSessionId, paymentReference: payment.paymentReference, expiresAt: order.expiresAt, environment: config.environment };
}

function logPaymentValidationFailure(error: unknown, stage: string, requestId?: string, order?: InstanceType<typeof OrderModel>) {
  if (!(error instanceof mongoose.Error.ValidationError)) return;
  const details = Object.entries(error.errors).slice(0, 12).map(([path, issue]) => {
    const issueName: string = issue.name;
    return {
    path: path.split(".").map((part) => /^[A-Za-z0-9_$-]{1,80}$/.test(part) ? part : "field").join("."),
    name: issueName,
    kind: "kind" in issue && typeof issue.kind === "string" ? issue.kind : undefined,
    reasonName: issue.reason instanceof Error ? issue.reason.name : undefined,
    message: issueName === "StrictModeError" ? "Mongoose strict mode rejected this path." : "Mongoose validation failed for this path.",
    stackLocation: typeof issue.stack === "string" ? issue.stack.split("\n").slice(0, 4).map((line) => line.trim().slice(0, 240)) : [],
  }; });
  logger.error("cashfree.payment_order_validation_failed", {
    requestId,
    stage,
    operation: "OrderModel.updateOne",
    errorName: error.name,
    paths: details,
    hydrated: !!order && !order.isNew,
    modifiedPaths: order?.modifiedPaths().filter((path) => !/customer|email|phone/i.test(path)).slice(0, 30) ?? [],
    financialSnapshotModified: !!order && ["discountPaise", "taxPaise", "currency"].some((path) => order.isModified(path)),
  });
}

export async function getCustomerOrderIdForCashfreeOrder(cashfreeOrderId: string, customerIdValue: string): Promise<string | null> {
  const userId = assertObjectId(customerIdValue, "userId");
  if (!/^[A-Za-z0-9_-]{3,128}$/.test(cashfreeOrderId)) return null;
  await connectToDatabase();
  const payment = await PaymentModel.findOne({ cashfreeOrderId, userId }).select("orderId").lean().exec();
  return payment?.orderId?.toString() ?? null;
}

/** Resolve the current state only from Cashfree's server API, never from browser callbacks. */
export async function getVerifiedPaymentStatus(orderIdValue: string, customerIdValue: string, gateway?: CashfreeGateway) {
  const orderId = assertObjectId(orderIdValue, "orderId");
  const userId = assertObjectId(customerIdValue, "userId");
  await connectToDatabase();
  const order = await OrderModel.findOne({ _id: orderId, userId });
  if (!order) throw new NotFoundError();
  if (order.paymentStatus === "paid") return toCustomerOrderView(order.toObject() as unknown as Record<string, unknown> & { _id?: Types.ObjectId | string });
  if (isOwnerHeldHistoricalRecovery(orderId.toString(), order.orderStatus)) return toCustomerOrderView(order.toObject() as unknown as Record<string, unknown> & { _id?: Types.ObjectId | string });
  const config = getCashfreeConfiguration();
  if (config.environment !== order.gatewayEnvironment) throw new IntegrationConfigurationError("Cashfree", ["CASHFREE_ENVIRONMENT"]);
  const cashfreeGateway = gateway ?? getCashfreeClient();
  const attempts = await PaymentModel.find({ orderId, userId, gatewayEnvironment: config.environment, amountPaise: order.totalPaise, currency: "INR", cashfreeOrderId: { $type: "string" } }).sort({ createdAt: -1 }).limit(26).lean().exec();
  if (attempts.length > 25) throw new ConflictError("This order has too many payment attempts for automatic status checking. Please contact support.");
  const allAttemptCount = await PaymentModel.countDocuments({ orderId, userId });
  const cashfreeOrderIds = [...new Set(attempts.flatMap((attempt) => attempt.cashfreeOrderId ? [attempt.cashfreeOrderId] : []))];
  const providerEvidence: Array<{ cashfreeOrderId: string; status: string; identityMatches: boolean; amountMatches: boolean; payments: Array<{ status: string; identityMatches: boolean; amountMatches: boolean }> }> = [];
  for (let offset = 0; offset < cashfreeOrderIds.length; offset += 5) {
    const batch = await Promise.all(cashfreeOrderIds.slice(offset, offset + 5).map(async (cashfreeOrderId) => {
      const [providerOrder, providerPayments] = await Promise.all([cashfreeGateway.fetchOrder(cashfreeOrderId), cashfreeGateway.fetchPayments(cashfreeOrderId)]);
      return { cashfreeOrderId, providerOrder, providerPayments };
    }));
    for (const { cashfreeOrderId, providerOrder, providerPayments } of batch) {
      providerEvidence.push({ cashfreeOrderId, status: providerOrder.status, identityMatches: providerOrder.orderId === cashfreeOrderId,
        amountMatches: providerOrder.amountPaise === order.totalPaise && providerOrder.currency === "INR",
        payments: providerPayments.map((payment) => ({ status: payment.status, identityMatches: payment.orderId === cashfreeOrderId,
          amountMatches: payment.amountPaise === order.totalPaise && payment.currency === "INR" })) });
      if (providerOrder.orderId !== cashfreeOrderId || providerOrder.amountPaise !== order.totalPaise || providerOrder.currency !== "INR") continue;
      for (const providerPayment of providerPayments) {
        if (providerPayment.orderId !== cashfreeOrderId) continue;
        await recordVerifiedPaymentStatus(orderId, userId, providerPayment, providerOrder.status);
      }
    }
  }
  if (allAttemptCount === attempts.length && canFinalizeVerifiedExpiredOrder(providerEvidence)) {
    for (const evidence of providerEvidence) {
      if (evidence.payments.length === 0) await recordVerifiedExpiredWithoutAttempt(orderId, userId, evidence.cashfreeOrderId);
    }
    const { expireOrderIfSettled } = await import("../../checkout/order-service");
    await expireOrderIfSettled(orderId, userId);
  }
  const refreshed = await OrderModel.findOne({ _id: orderId, userId }).lean().exec();
  if (!refreshed) throw new NotFoundError();
  return toCustomerOrderView(refreshed as unknown as Record<string, unknown> & { _id?: Types.ObjectId | string });
}

/** A verified expired provider order with zero payments can close its pending local attempt. */
async function recordVerifiedExpiredWithoutAttempt(orderId: Types.ObjectId, userId: Types.ObjectId, cashfreeOrderId: string) {
  const session = await mongoose.connection.getClient().startSession();
  try {
    await session.withTransaction(async () => {
      const order = await OrderModel.findOne({ _id: orderId, userId, orderStatus: "awaiting_payment", paymentStatus: { $in: ["pending", "failed"] } }).session(session);
      const payment = await PaymentModel.findOne({ orderId, userId, cashfreeOrderId, status: "pending", cashfreePaymentId: { $exists: false } }).session(session);
      if (!order || !payment || order.gatewayEnvironment !== payment.gatewayEnvironment || payment.amountPaise !== order.totalPaise || payment.currency !== order.currency) return;
      const expectedPayment = capturePaymentLifecycle(payment);
      const expectedOrder: ExpectedOrderLifecycle = { orderStatus: order.orderStatus, paymentStatus: order.paymentStatus,
        ...(order.updatedAt ? { updatedAt: order.updatedAt } : {}) };
      payment.status = "interrupted";
      payment.providerStatus = "EXPIRED_NO_ATTEMPT";
      payment.lastEventAt = new Date();
      await persistPaymentLifecycle(payment, expectedPayment, session);
      if (order.paymentStatus === "pending") await persistOrderLifecycleChanges({ orderId, userId, session, expected: expectedOrder,
        changes: { paymentStatus: "failed" } });
      await AuditLogModel.create([{ actorType: "system", action: "payment.provider_order_expired_without_attempt", targetType: "order",
        targetId: orderId.toString(), changedFields: ["paymentStatus", "paymentAttempt"],
        reason: "Cashfree verified an expired order with no payment attempts; no purchase was granted." }], { session });
    });
  } finally { await session.endSession(); }
}

export interface VerifiedPaymentData {
  orderId: string; paymentId: string; amountPaise: number; currency: "INR"; status: string;
}

export interface WebhookEventSnapshot {
  providerEventId: string; eventType: string; payloadDigest: string; cashfreeOrderId: string; cashfreePaymentId: string;
}

export async function recordVerifiedPaymentStatus(orderId: Types.ObjectId, userId: Types.ObjectId, providerPayment: VerifiedPaymentData, providerOrderStatus?: string, webhookEvent?: WebhookEventSnapshot) {
  await connectToDatabase();
  const session = await mongoose.connection.getClient().startSession();
  try {
    await session.withTransaction(async () => {
      if (webhookEvent) {
        await WebhookEventModel.create([{
          provider: "cashfree", providerEventId: webhookEvent.providerEventId,
          eventType: webhookEvent.eventType, orderId, payloadDigest: webhookEvent.payloadDigest,
          cashfreeOrderId: webhookEvent.cashfreeOrderId, cashfreePaymentId: webhookEvent.cashfreePaymentId,
          processingStatus: "processed", receivedAt: new Date(), processedAt: new Date(),
        }], { session });
      }
      const order = await OrderModel.findOne({ _id: orderId, userId }).session(session);
      const payment = await PaymentModel.findOne({ orderId, userId, cashfreeOrderId: providerPayment.orderId }).session(session);
      if (!order || !payment || order.gatewayEnvironment !== payment.gatewayEnvironment) throw new NotFoundError();
      const previousOrderState: ExpectedOrderLifecycle = {
        orderStatus: order.orderStatus,
        paymentStatus: order.paymentStatus,
        ...(order.updatedAt ? { updatedAt: order.updatedAt } : {}),
      };
      const previousPaidAt = order.paidAt;
      const verifiedAt = new Date();
      const status = providerPayment.status.toUpperCase();
      const transition = classifyVerifiedOrderPayment({
        orderStatus: order.orderStatus, paymentStatus: order.paymentStatus,
        providerStatus: status, expiresAt: order.expiresAt, now: verifiedAt,
      });
      const isSuccess = status === "SUCCESS";
      if (providerPayment.currency !== "INR" || providerPayment.amountPaise !== order.totalPaise ||
        providerPayment.orderId !== payment.cashfreeOrderId) {
        const expectedPayment = capturePaymentLifecycle(payment);
        payment.failureCode = "PAYMENT_DETAILS_MISMATCH";
        payment.failureSummary = "Provider payment did not match the stored INR order.";
        await persistPaymentLifecycle(payment, expectedPayment, session);
        return;
      }
      if (isSuccess && providerOrderStatus !== undefined && providerOrderStatus !== "PAID") {
        const expectedPayment = capturePaymentLifecycle(payment);
        payment.failureCode = "PROVIDER_ORDER_NOT_PAID";
        payment.failureSummary = "Provider payment and order statuses did not match.";
        await persistPaymentLifecycle(payment, expectedPayment, session);
        return;
      }
      const existingTransaction = await PaymentModel.findOne({ cashfreePaymentId: providerPayment.paymentId }).session(session);
      if (existingTransaction && (!existingTransaction.orderId.equals(orderId) || !existingTransaction.userId.equals(userId) || existingTransaction.cashfreeOrderId !== providerPayment.orderId)) {
        throw new ConflictError();
      }
      let targetPayment = existingTransaction ?? payment;
      let expectedTargetPayment: ExpectedPaymentLifecycle;
      if (!existingTransaction && payment.cashfreePaymentId && payment.cashfreePaymentId !== providerPayment.paymentId) {
        const [transaction] = await PaymentModel.create([{
          paymentReference: `PAY-${randomUUID()}`,
          orderId, userId, gatewayEnvironment: payment.gatewayEnvironment,
          cashfreeOrderId: payment.cashfreeOrderId,
          amountPaise: payment.amountPaise, currency: payment.currency,
          cashfreePaymentId: providerPayment.paymentId,
          status: "pending",
        }], { session });
        if (!transaction) throw new ConflictError();
        targetPayment = transaction;
        expectedTargetPayment = capturePaymentLifecycle(targetPayment);
      } else {
        expectedTargetPayment = capturePaymentLifecycle(targetPayment);
        targetPayment.cashfreePaymentId = providerPayment.paymentId;
      }
      if (transition === "refund_locked") {
        const previousStatus = targetPayment.status;
        const previousProviderStatus = targetPayment.providerStatus;
        targetPayment.providerStatus = status.slice(0, 64);
        targetPayment.lastEventAt = new Date();
        if (isSuccess) {
          targetPayment.status = "success";
          targetPayment.paidAt ??= new Date();
        } else if (targetPayment.status !== "success") {
          if (status === "PENDING") targetPayment.status = "pending";
          else if (status === "NOT_ATTEMPTED" || status === "USER_DROPPED") targetPayment.status = "interrupted";
          else if (status === "FAILED") targetPayment.status = "failed";
        }
        if (previousStatus !== targetPayment.status || previousProviderStatus !== targetPayment.providerStatus) {
          await AuditLogModel.create([{
            actorType: "system", action: "payment.event_after_refund", targetType: "order",
            targetId: order._id.toString(), changedFields: ["paymentAttempt", "providerStatus"],
            reason: "A verified payment update arrived after the order entered refund processing; fulfillment was left unchanged.",
          }], { session });
        }
        await persistPaymentLifecycle(targetPayment, expectedTargetPayment, session);
        if (order.orderStatus === "refunded" && !await PaymentModel.exists({ orderId, userId, status: "pending" }).session(session)) {
          await CheckoutClaimModel.updateMany({ orderId, userId, status: "active" }, { $set: { status: "refunded", releasedAt: new Date() } }, { session });
        }
        return;
      }
      const duplicateOrderSuccess = transition === "duplicate_success" && targetPayment.status !== "success";
      const firstVerifiedOrderSuccess = transition === "first_success" || transition === "late_success";
      if (targetPayment.status !== "success") {
        targetPayment.providerStatus = status.slice(0, 64);
        targetPayment.lastEventAt = new Date();
        if (isSuccess) {
          targetPayment.status = "success";
          targetPayment.paidAt ??= verifiedAt;
          order.orderStatus = "paid";
          order.paymentStatus = "paid";
          order.paidAt ??= targetPayment.paidAt;
          if (firstVerifiedOrderSuccess) {
            if (transition === "late_success") {
              await AuditLogModel.create([{
                actorType: "system", action: "payment.verified_late_success_reconciled", targetType: "order",
                targetId: order._id.toString(), changedFields: ["orderStatus", "paymentStatus", "paidAt"],
                reason: "Cashfree verified payment after order expiry or cancellation; payment was honored and fulfillment was granted. Review coupon reservation capacity if applicable.",
              }], { session });
            }
            await grantPaidOrderFulfillment(order as typeof order & { _id: Types.ObjectId }, session);
            if (order.couponSnapshot?.couponId) {
              const redemption = await CouponRedemptionModel.findOne({ couponId: order.couponSnapshot.couponId, orderId: order._id }).session(session);
              if (redemption?.status === "reserved" || redemption?.status === "released") {
                const lateReservation = redemption.status === "released" ||
                  (redemption.reservationExpiresAt !== undefined && redemption.reservationExpiresAt <= verifiedAt);
                if (lateReservation) await CouponModel.updateOne({ _id: order.couponSnapshot.couponId }, { $inc: { reservationSequence: 1 } }, { session });
                redemption.status = "redeemed";
                redemption.redeemedAt = verifiedAt;
                await redemption.save({ session });
                if (lateReservation) {
                  const coupon = await CouponModel.findById(order.couponSnapshot.couponId).select("totalRedemptionLimit perCustomerRedemptionLimit").session(session).lean().exec();
                  const uses = await CouponRedemptionModel.countDocuments({ couponId: order.couponSnapshot.couponId, $or: [{ status: "redeemed" }, { status: "reserved", reservationExpiresAt: { $gt: verifiedAt } }] }).session(session);
                  const customerUses = await CouponRedemptionModel.countDocuments({ couponId: order.couponSnapshot.couponId, userId, $or: [{ status: "redeemed" }, { status: "reserved", reservationExpiresAt: { $gt: verifiedAt } }] }).session(session);
                  const overLimit = (coupon?.totalRedemptionLimit !== undefined && uses > coupon.totalRedemptionLimit) ||
                    (coupon?.perCustomerRedemptionLimit !== undefined && customerUses > coupon.perCustomerRedemptionLimit);
                  await AuditLogModel.create([{
                    actorType: "system", action: overLimit ? "coupon.late_redemption_capacity_review" : "coupon.redemption_after_reservation_expiry",
                    targetType: "order", targetId: order._id.toString(), changedFields: ["couponSnapshot", "redemptionStatus"],
                    reason: overLimit
                      ? "A verified late payment redeemed an expired reservation after its capacity may have been reused; operator reconciliation is required. No automatic refund was issued."
                      : "A verified late payment redeemed its expired or released reservation; review provider timing during reconciliation.",
                  }], { session });
                }
              } else if (redemption?.status !== "redeemed") {
                await AuditLogModel.create([{
                  actorType: "system", action: "coupon.redemption_reconciliation_required", targetType: "order",
                  targetId: order._id.toString(), changedFields: ["couponSnapshot"],
                  reason: "Verified payment did not have an active coupon reservation.",
                }], { session });
              }
            }
          }
        } else if (status === "PENDING") {
          targetPayment.status = "pending";
          if (order.paymentStatus !== "paid") order.paymentStatus = "pending";
        } else if (status === "NOT_ATTEMPTED") {
          targetPayment.status = "interrupted";
          if (order.paymentStatus !== "paid") order.paymentStatus = "failed";
        } else if (status === "USER_DROPPED") {
          targetPayment.status = "interrupted";
          if (order.paymentStatus !== "paid") order.paymentStatus = "failed";
        } else if (status === "FAILED") {
          targetPayment.status = "failed";
          if (order.paymentStatus !== "paid") order.paymentStatus = "failed";
        }
      }
      if (duplicateOrderSuccess) {
        await AuditLogModel.create([{
          actorType: "system", action: "payment.duplicate_success_detected", targetType: "order",
          targetId: order._id.toString(), changedFields: ["paymentStatus", "cashfreePaymentId"],
          reason: "A second successful Cashfree payment was received for an already paid order.",
        }], { session });
        targetPayment.failureCode = "DUPLICATE_SUCCESS_ORDER";
        targetPayment.failureSummary = "Order already has a successful payment; reconciliation is required.";
      }
      await persistPaymentLifecycle(targetPayment, expectedTargetPayment, session);
      if (order.paymentStatus !== "paid") {
        const paymentStates = await PaymentModel.find({ orderId, userId }).select("status").session(session).lean().exec();
        order.paymentStatus = paymentStates.some((item) => item.status === "pending")
          ? "pending"
          : paymentStates.length > 0 ? "failed" : "unpaid";
      }
      const orderChanges: OrderLifecycleChanges = {};
      if (order.orderStatus !== previousOrderState.orderStatus) orderChanges.orderStatus = order.orderStatus;
      if (order.paymentStatus !== previousOrderState.paymentStatus) orderChanges.paymentStatus = order.paymentStatus;
      if (order.paidAt && order.paidAt.getTime() !== previousPaidAt?.getTime()) orderChanges.paidAt = order.paidAt;
      if (Object.keys(orderChanges).length) {
        await persistOrderLifecycleChanges({ orderId, userId, session, expected: previousOrderState, changes: orderChanges });
      }
      if (order.orderStatus === "paid" && order.paymentStatus === "paid" &&
        !await PaymentModel.exists({ orderId, userId, status: "pending" }).session(session)) {
        await CheckoutClaimModel.updateMany({ orderId, userId, status: "active" }, { $set: { status: "completed", completedAt: verifiedAt } }, { session });
      }
    });
  } finally {
    await session.endSession();
  }
}

