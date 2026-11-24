import "server-only";

import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import mongoose, { Types } from "mongoose";
import { z } from "zod";
import { connectToDatabase } from "../../db/mongodb";
import { OrderModel, PaymentModel, RefundModel, WebhookEventModel } from "../../db/models";
import { ConflictError, NotFoundError, ProviderCommunicationError, ValidationError, WebhookSignatureError } from "../../errors/app-error";
import { getCashfreeClient, type CashfreeGateway } from "./client";
import { getCashfreeConfiguration } from "./config";
import { recordVerifiedPaymentStatus, type VerifiedPaymentData, type WebhookEventSnapshot } from "./payment-service";
import { applyVerifiedCashfreeRefund } from "./refund-service";

const webhookSchema = z.object({
  type: z.string().min(1).max(100),
  data: z.object({
    order: z.object({ order_id: z.string().min(1).max(128) }).passthrough(),
    payment: z.object({
      cf_payment_id: z.union([z.string(), z.number()]).transform(String).pipe(z.string().min(1).max(128)),
      payment_status: z.string().min(1).max(64),
      payment_amount: z.number().finite().nonnegative(),
      payment_currency: z.string().length(3),
    }).passthrough(),
  }).passthrough(),
}).passthrough();

export const CASHFREE_WEBHOOK_MAX_BODY_BYTES = 512 * 1024;

const refundWebhookSchema = z.object({
  type: z.literal("REFUND_STATUS_WEBHOOK"),
  data: z.object({
    refund: z.object({
      cf_refund_id: z.union([z.string(), z.number()]).transform(String).pipe(z.string().min(1).max(128)),
      cf_payment_id: z.union([z.string(), z.number()]).transform(String).pipe(z.string().min(1).max(128)),
      refund_id: z.string().min(1).max(40),
      order_id: z.string().min(1).max(128),
      refund_amount: z.number().finite().positive(),
      refund_currency: z.string().length(3),
      refund_status: z.string().min(1).max(64),
    }).passthrough(),
  }).passthrough(),
}).passthrough();

const autoRefundWebhookSchema = z.object({
  type: z.literal("AUTO_REFUND_STATUS_WEBHOOK"),
  data: z.object({
    auto_refund: z.object({
      cf_refund_id: z.union([z.string(), z.number()]).transform(String).pipe(z.string().min(1).max(128)),
      order_id: z.string().min(1).max(128),
    }).passthrough(),
  }).passthrough(),
}).passthrough();

export function verifyCashfreeWebhookSignature(rawBody: string, timestamp: string, signature: string, secret: string): boolean {
  if (!/^\d{10,16}$/.test(timestamp) || !signature || signature.length > 256 || !/^[A-Za-z0-9+/]+={0,2}$/.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(timestamp + rawBody, "utf8").digest();
  let received: Buffer;
  try { received = Buffer.from(signature, "base64"); } catch { return false; }
  return received.length === expected.length && timingSafeEqual(received, expected);
}

function eventKey(header: string | null, rawBody: string): string {
  if (header) {
    if (!/^[A-Za-z0-9._:-]{1,160}$/.test(header)) throw new ValidationError([{ field: "x-idempotency-header", message: "Webhook reference is invalid." }]);
    return header;
  }
  return createHash("sha256").update(rawBody).digest("hex");
}

function paiseFromRupees(value: number): number {
  const paise = Math.round(value * 100);
  if (!Number.isSafeInteger(paise) || paise < 0) throw new ValidationError([{ field: "payment_amount", message: "Payment amount is invalid." }]);
  return paise;
}

function isDuplicate(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
}

async function persistDeadLetter(event: WebhookEventSnapshot, eventType: string, orderId?: Types.ObjectId) {
  const session = await mongoose.connection.getClient().startSession();
  try {
    await session.withTransaction(async () => {
      await WebhookEventModel.create([{
        provider: "cashfree", providerEventId: event.providerEventId, eventType,
        ...(orderId ? { orderId } : {}), cashfreeOrderId: event.cashfreeOrderId,
        cashfreePaymentId: event.cashfreePaymentId, payloadDigest: event.payloadDigest,
        processingStatus: "dead_letter", receivedAt: new Date(), processedAt: new Date(),
        errorCode: "PAYMENT_RECONCILIATION_REQUIRED", errorSummary: "Verified event did not match the stored order/payment record.",
      }], { session });
    });
  } catch (error) {
    if (!isDuplicate(error)) throw error;
  } finally {
    await session.endSession();
  }
}

async function processRefundWebhook(rawBody: string, payload: unknown, idempotencyHeader: string | null, gateway: CashfreeGateway, gatewayEnvironment: "sandbox" | "production") {
  const parsed = refundWebhookSchema.safeParse(payload);
  if (!parsed.success) throw new ValidationError([{ field: "body", message: "Refund webhook payload is invalid." }]);
  const refundEvent = parsed.data.data.refund;
  const providerEventId = eventKey(idempotencyHeader, rawBody);
  const payloadDigest = createHash("sha256").update(rawBody).digest("hex");
  await connectToDatabase();
  if (await WebhookEventModel.exists({ provider: "cashfree", providerEventId })) return { duplicate: true };
  const applicationRefund = await RefundModel.findOne({ refundId: refundEvent.refund_id, cashfreeOrderId: refundEvent.order_id }).lean().exec();
  const verified = await gateway.fetchRefund(refundEvent.order_id, refundEvent.refund_id);
  const webhookAmount = paiseFromRupees(refundEvent.refund_amount);
  if ((applicationRefund && applicationRefund.gatewayEnvironment !== gatewayEnvironment) ||
    verified.orderId !== refundEvent.order_id || verified.refundId !== refundEvent.refund_id ||
    verified.providerRefundId !== refundEvent.cf_refund_id || verified.paymentId !== refundEvent.cf_payment_id ||
    verified.amountPaise !== webhookAmount || verified.currency !== refundEvent.refund_currency) {
    await WebhookEventModel.create([{
      provider: "cashfree", providerEventId, eventType: parsed.data.type,
      ...(applicationRefund ? { orderId: applicationRefund.orderId, refundId: applicationRefund._id } : {}),
      cashfreeOrderId: refundEvent.order_id, cashfreeRefundId: refundEvent.cf_refund_id, payloadDigest,
      processingStatus: "dead_letter", receivedAt: new Date(), processedAt: new Date(),
      errorCode: "REFUND_DETAILS_MISMATCH", errorSummary: "Verified refund did not match the signed Cashfree event.",
    }]);
    return { accepted: true, reconciled: false };
  }
  try {
    const result = await applyVerifiedCashfreeRefund(
      refundEvent.refund_id,
      verified,
      { providerEventId, eventType: parsed.data.type, payloadDigest, cashfreeOrderId: refundEvent.order_id, cashfreeRefundId: refundEvent.cf_refund_id, gatewayEnvironment },
    );
    return result.matched ? { accepted: true, reconciled: true } : { accepted: true, reconciled: false };
  } catch (error) {
    if (isDuplicate(error)) return { duplicate: true };
    if (error instanceof NotFoundError || error instanceof ConflictError) throw new ProviderCommunicationError("Cashfree", "rejected");
    throw error;
  }
}

async function recordCashfreeAutoRefund(rawBody: string, payload: unknown, idempotencyHeader: string | null) {
  const parsed = autoRefundWebhookSchema.safeParse(payload);
  if (!parsed.success) throw new ValidationError([{ field: "body", message: "Automatic refund webhook payload is invalid." }]);
  const event = parsed.data.data.auto_refund;
  const providerEventId = eventKey(idempotencyHeader, rawBody);
  await connectToDatabase();
  if (await WebhookEventModel.exists({ provider: "cashfree", providerEventId })) return { duplicate: true };
  await WebhookEventModel.create([{
    provider: "cashfree", providerEventId, eventType: parsed.data.type,
    cashfreeOrderId: event.order_id, cashfreeRefundId: event.cf_refund_id,
    payloadDigest: createHash("sha256").update(rawBody).digest("hex"),
    processingStatus: "dead_letter", receivedAt: new Date(), processedAt: new Date(),
    errorCode: "AUTOMATIC_REFUND_REVIEW", errorSummary: "Cashfree automatic refund needs reconciliation with its payment attempt.",
  }]);
  return { accepted: true, reconciled: false };
}

/** Verify raw Cashfree signatures, then safely record the authenticated payment state. */
export async function processCashfreeWebhook(
  rawBody: string,
  headers: { timestamp: string | null; signature: string | null; idempotency: string | null },
  gateway: CashfreeGateway = getCashfreeClient(),
) {
  if (Buffer.byteLength(rawBody, "utf8") > CASHFREE_WEBHOOK_MAX_BODY_BYTES) throw new ValidationError([{ field: "body", message: "Webhook payload is too large." }]);
  const config = getCashfreeConfiguration();
  if (!headers.timestamp || !headers.signature || !verifyCashfreeWebhookSignature(rawBody, headers.timestamp, headers.signature, config.clientSecret)) {
    throw new WebhookSignatureError();
  }
  let json: unknown;
  try { json = JSON.parse(rawBody); } catch { throw new ValidationError([{ field: "body", message: "Webhook payload is invalid." }]); }
  if (typeof json === "object" && json !== null && "type" in json && json.type === "REFUND_STATUS_WEBHOOK") {
    return processRefundWebhook(rawBody, json, headers.idempotency, gateway, config.environment);
  }
  if (typeof json === "object" && json !== null && "type" in json && json.type === "AUTO_REFUND_STATUS_WEBHOOK") {
    return recordCashfreeAutoRefund(rawBody, json, headers.idempotency);
  }
  const parsed = webhookSchema.safeParse(json);
  if (!parsed.success) throw new ValidationError([{ field: "body", message: "Webhook payload is invalid." }]);
  const payload = parsed.data;
  const providerEventId = eventKey(headers.idempotency, rawBody);
  const payloadDigest = createHash("sha256").update(rawBody).digest("hex");
  const cashfreeOrderId = payload.data.order.order_id;
  const cashfreePaymentId = payload.data.payment.cf_payment_id;
  const status = payload.data.payment.payment_status.toUpperCase();
  const event: WebhookEventSnapshot = { providerEventId, eventType: payload.type, payloadDigest, cashfreeOrderId, cashfreePaymentId };

  await connectToDatabase();
  if (await WebhookEventModel.exists({ provider: "cashfree", providerEventId })) return { duplicate: true };
  const paymentAttempt = await PaymentModel.findOne({ cashfreeOrderId }).sort({ createdAt: 1 }).lean().exec();
  if (!paymentAttempt) {
    await persistDeadLetter(event, payload.type);
    return { accepted: true, reconciled: false };
  }
  const order = await OrderModel.findOne({ _id: paymentAttempt.orderId, userId: paymentAttempt.userId }).lean().exec();
  if (!order || paymentAttempt.gatewayEnvironment !== config.environment || paymentAttempt.amountPaise !== order.totalPaise ||
    payload.data.payment.payment_currency !== "INR" || paiseFromRupees(payload.data.payment.payment_amount) !== order.totalPaise) {
    await persistDeadLetter(event, payload.type, paymentAttempt.orderId);
    return { accepted: true, reconciled: false };
  }

  let paymentData: VerifiedPaymentData = {
    orderId: cashfreeOrderId,
    paymentId: cashfreePaymentId,
    amountPaise: paiseFromRupees(payload.data.payment.payment_amount),
    currency: "INR",
    status,
  };
  let providerOrderStatus: string | undefined;
  if (status === "SUCCESS") {
    const [verifiedPayment, verifiedOrder] = await Promise.all([
      gateway.fetchPayment(cashfreeOrderId, cashfreePaymentId),
      gateway.fetchOrder(cashfreeOrderId),
    ]);
    if (verifiedPayment.orderId !== cashfreeOrderId || verifiedPayment.paymentId !== cashfreePaymentId ||
      verifiedPayment.amountPaise !== order.totalPaise || verifiedPayment.currency !== "INR" || verifiedPayment.status !== "SUCCESS" ||
      verifiedOrder.orderId !== cashfreeOrderId || verifiedOrder.amountPaise !== order.totalPaise ||
      verifiedOrder.currency !== "INR" || verifiedOrder.status !== "PAID") {
      await persistDeadLetter(event, payload.type, paymentAttempt.orderId);
      return { accepted: true, reconciled: false };
    }
    paymentData = verifiedPayment;
    providerOrderStatus = verifiedOrder.status;
  } else if (!["PENDING", "FAILED", "NOT_ATTEMPTED", "USER_DROPPED"].includes(status)) {
    await persistDeadLetter(event, payload.type, paymentAttempt.orderId);
    return { accepted: true, reconciled: false };
  }

  if (status === "USER_DROPPED") paymentData = { ...paymentData, status: "NOT_ATTEMPTED" };
  try {
    await recordVerifiedPaymentStatus(paymentAttempt.orderId, paymentAttempt.userId, paymentData, providerOrderStatus, event);
  } catch (error) {
    if (isDuplicate(error)) return { duplicate: true };
    if (error instanceof NotFoundError || error instanceof ConflictError) throw new ProviderCommunicationError("Cashfree", "rejected");
    throw error;
  }
  return { accepted: true, reconciled: true };
}
