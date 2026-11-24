import "server-only";

import { Types } from "mongoose";
import { connectToDatabase } from "../db/mongodb";
import { BookingModel, OrderModel, OutboxEventModel, RefundModel, type OutboxEvent } from "../db/models";
import { getServerEnv } from "../env/server";
import { sendResendMessage, type ResendMessage } from "./resend";
import { formatINR } from "../format/currency";

const emailEventTypes = ["purchase_confirmation", "booking_confirmation", "booking_status", "refund_confirmation"] as const;
const maxAttempts = 8;

export function outboxRetryDelayMs(attemptCount: number): number {
  return Math.min(60 * 60_000, 30_000 * 2 ** Math.min(attemptCount - 1, 7));
}

export function isTransactionalEmailEligible(input: {
  eventType: OutboxEvent["eventType"];
  orderStatus: string;
  paymentStatus: string;
  bookingStatus?: string;
  refundStatus?: string;
}): boolean {
  const paymentConfirmed = (input.orderStatus === "paid" && input.paymentStatus === "paid") ||
    (input.orderStatus === "partially_refunded" && input.paymentStatus === "partially_refunded");
  if (input.eventType === "purchase_confirmation" || input.eventType === "booking_confirmation") {
    return paymentConfirmed;
  }
  if (input.eventType === "refund_confirmation") {
    return input.orderStatus === "refunded" && input.paymentStatus === "refunded" && input.refundStatus === "success";
  }
  return (input.eventType === "booking_status" && input.orderStatus === "refunded" && input.bookingStatus === "cancelled") ||
    (input.eventType === "booking_status" && paymentConfirmed);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

export function buildPurchaseConfirmation(input: { name: string; orderReference: string; dashboardUrl: string; lines: Array<{ productName: string; quantity: number; lineTotalPaise: number }>; totalPaise: number }): ResendMessage {
  const name = escapeHtml(input.name);
  const ref = escapeHtml(input.orderReference);
  const link = escapeHtml(input.dashboardUrl);
  const linesText = input.lines.map((line) => `- ${line.productName} x ${line.quantity}: ${formatINR(line.lineTotalPaise)}`).join("\n");
  const linesHtml = input.lines.map((line) => `<li>${escapeHtml(line.productName)} x ${line.quantity}: <strong>${escapeHtml(formatINR(line.lineTotalPaise))}</strong></li>`).join("");
  const total = formatINR(input.totalPaise);
  return {
    to: "", subject: `Payment confirmed - ${input.orderReference}`,
    text: `Hello ${input.name},\n\nPayment for order ${input.orderReference} is confirmed.\n\nItems:\n${linesText}\n\nTotal paid: ${total}\nView your order and access details in your account: ${input.dashboardUrl}\n\nMoneyTreeVentures`,
    html: `<p>Hello ${name},</p><p>Payment for order <strong>${ref}</strong> is confirmed.</p><ul>${linesHtml}</ul><p>Total paid: <strong>${escapeHtml(total)}</strong></p><p><a href="${link}">View your order and access details</a></p><p>MoneyTreeVentures</p>`,
  };
}
export function buildBookingMessage(input: { name: string; reference: string; status: string; instructions: string; dashboardUrl: string }): ResendMessage {
  const statusText: Record<string, string> = {
    awaiting_scheduling: "We have received your consultation request. Your requested time is not confirmed yet. Please submit your preferred times in your account.",
    scheduled: "A time has been scheduled for your consultation. Please review the appointment details in your account; it is not confirmed until our team confirms it.",
    confirmed: "Your consultation appointment is confirmed. Please review the appointment details in your account.",
    completed: "Your 1:1 guidance consultation is complete. You can review the booking record in your account.",
    cancelled: "Your consultation booking has been cancelled. Please contact support if you need help.",
  };
  const description = statusText[input.status] ?? "Your consultation booking has been updated. Please review the latest details in your account.";
  const name = escapeHtml(input.name);
  const reference = escapeHtml(input.reference);
  const instructions = escapeHtml(input.instructions);
  const link = escapeHtml(input.dashboardUrl);
  return {
    to: "", subject: `Consultation booking update - ${input.reference}`,
    text: `Hello ${input.name},\n\n${description}\nBooking reference: ${input.reference}\n${input.instructions}\n\n${input.dashboardUrl}\nMoneyTreeVentures`,
    html: `<p>Hello ${name},</p><p>${escapeHtml(description)}</p><p>Booking reference: <strong>${reference}</strong></p>${instructions ? `<p>${instructions}</p>` : ""}<p><a href="${link}">View booking details</a></p><p>MoneyTreeVentures</p>`,
  };
}
export function buildRefundConfirmation(input: { name: string; orderReference: string; amountPaise: number; dashboardUrl: string }): ResendMessage {
  const amount = formatINR(input.amountPaise);
  const name = escapeHtml(input.name);
  const reference = escapeHtml(input.orderReference);
  const safeAmount = escapeHtml(amount);
  const link = escapeHtml(input.dashboardUrl);
  return {
    to: "", subject: `Refund confirmed - ${input.orderReference}`,
    text: `Hello ${input.name},\n\nCashfree has confirmed a refund of ${amount} for order ${input.orderReference}. The credit may take some time to appear in your bank account or payment method. View order details in your account: ${input.dashboardUrl}\n\nMoneyTreeVentures`,
    html: `<p>Hello ${name},</p><p>Cashfree has confirmed a refund of <strong>${safeAmount}</strong> for order <strong>${reference}</strong>. The credit may take some time to appear in your bank account or payment method.</p><p><a href="${link}">View order details</a></p><p>MoneyTreeVentures</p>`,
  };
}
async function sendOutboxEmail(event: OutboxEvent & { _id: Types.ObjectId }): Promise<void> {
  const payload = event.payload;
  const orderId = payload.orderId;
  if (!payload.userId || !orderId) throw new Error("OUTBOX_REFERENCE_MISSING");
  const order = await OrderModel.findOne({ _id: orderId, userId: payload.userId }).select("orderReference customerSnapshot orderStatus paymentStatus lines totalPaise").lean().exec();
  if (!order) throw new Error("ORDER_NOT_FOUND");
  const dashboardUrl = new URL("/account", getServerEnv().APP_URL).toString();
  if (event.eventType === "purchase_confirmation") {
    if (!isTransactionalEmailEligible({ eventType: event.eventType, orderStatus: order.orderStatus, paymentStatus: order.paymentStatus })) return;
    // Ignore legacy per-entitlement events so queued old events cannot send one email per PDF.
    if (event.aggregateType !== "order" || !event.aggregateId.equals(orderId)) return;
    const message = buildPurchaseConfirmation({
      name: order.customerSnapshot.name, orderReference: order.orderReference, dashboardUrl,
      lines: order.lines.map((line) => ({ productName: line.productName, quantity: line.quantity, lineTotalPaise: line.lineTotalPaise })),
      totalPaise: order.totalPaise,
    });
    message.to = order.customerSnapshot.email;
    await sendResendMessage(message, event.dedupeKey ?? `outbox/${event._id.toString()}`);
    return;
  }
  if (event.eventType === "refund_confirmation") {
    if (!payload.refundId) throw new Error("REFUND_REFERENCE_MISSING");
    const refund = await RefundModel.findOne({ _id: payload.refundId, userId: payload.userId, orderId, status: "success" })
      .select("amountPaise status").lean().exec();
    if (!refund || !isTransactionalEmailEligible({
      eventType: event.eventType, orderStatus: order.orderStatus, paymentStatus: order.paymentStatus, refundStatus: refund.status,
    })) return;
    const message = buildRefundConfirmation({
      name: order.customerSnapshot.name, orderReference: order.orderReference,
      amountPaise: refund.amountPaise, dashboardUrl,
    });
    message.to = order.customerSnapshot.email;
    await sendResendMessage(message, event.dedupeKey ?? `outbox/${event._id.toString()}`);
    return;
  }
  if (!payload.bookingId) throw new Error("BOOKING_REFERENCE_MISSING");
  const booking = await BookingModel.findOne({ _id: payload.bookingId, userId: payload.userId, orderId }).lean().exec();
  if (!booking) throw new Error("BOOKING_NOT_FOUND");
  if (!isTransactionalEmailEligible({ eventType: event.eventType, orderStatus: order.orderStatus, paymentStatus: order.paymentStatus, bookingStatus: booking.status })) return;
  const message = buildBookingMessage({
    name: order.customerSnapshot.name,
    reference: booking.bookingReference,
    status: booking.status,
    instructions: booking.schedulingInstructions,
    dashboardUrl,
  });
  message.to = order.customerSnapshot.email;
  await sendResendMessage(message, event.dedupeKey ?? `outbox/${event._id.toString()}`);
}

/** Claims and sends a bounded batch. Email API idempotency protects retries after ambiguous network failures. */
export async function processEmailOutboxBatch(limit = 10): Promise<{ sent: number; retried: number; deadLetter: number }> {
  await connectToDatabase();
  const boundedLimit = Math.max(1, Math.min(Math.trunc(limit), 25));
  const counters = { sent: 0, retried: 0, deadLetter: 0 };
  for (let index = 0; index < boundedLimit; index += 1) {
    const now = new Date();
    const claimed = await OutboxEventModel.findOneAndUpdate(
      {
        eventType: { $in: emailEventTypes },
        $or: [
          { status: { $in: ["pending", "retry"] }, nextAttemptAt: { $lte: now } },
          { status: "processing", updatedAt: { $lte: new Date(now.getTime() - 5 * 60_000) } },
        ],
      },
      { $set: { status: "processing" }, $inc: { attemptCount: 1 } },
      { sort: { nextAttemptAt: 1, createdAt: 1 }, returnDocument: "after" },
    ).lean().exec() as unknown as (OutboxEvent & { _id: Types.ObjectId }) | null;
    if (!claimed) break;
    try {
      await sendOutboxEmail(claimed);
      await OutboxEventModel.updateOne({ _id: claimed._id, status: "processing" }, { $set: { status: "sent", processedAt: new Date(), lastErrorCode: null, lastErrorSummary: null } });
      counters.sent += 1;
    } catch (error) {
      const dead = claimed.attemptCount >= maxAttempts;
      const delay = outboxRetryDelayMs(claimed.attemptCount);
      await OutboxEventModel.updateOne({ _id: claimed._id, status: "processing" }, {
        $set: {
          status: dead ? "dead_letter" : "retry",
          nextAttemptAt: new Date(Date.now() + delay),
          lastErrorCode: error instanceof Error && /^[A-Z0-9_]{1,64}$/.test(error.message) ? error.message : "EMAIL_DELIVERY_FAILED",
          lastErrorSummary: "Transactional email delivery failed.",
        },
      });
      counters[dead ? "deadLetter" : "retried"] += 1;
    }
  }
  return counters;
}
