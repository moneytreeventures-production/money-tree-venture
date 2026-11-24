import { Schema, Types } from "mongoose";
import { nonEmptyString, objectId, optionalText, registerModel, timestamps } from "./common";
import type { Model } from "mongoose";

export interface WebhookEvent {
  provider: "cashfree"; providerEventId: string; eventType: string; orderId?: Types.ObjectId; paymentId?: Types.ObjectId; refundId?: Types.ObjectId;
  cashfreeOrderId?: string; cashfreePaymentId?: string; cashfreeRefundId?: string; payloadDigest: string;
  processingStatus: "received" | "processing" | "processed" | "retry" | "dead_letter";
  receivedAt: Date; processedAt?: Date; errorCode?: string; errorSummary?: string; createdAt?: Date; updatedAt?: Date;
}

export const webhookEventSchema = new Schema<WebhookEvent>({
  provider: { type: String, enum: ["cashfree"], default: "cashfree", required: true, immutable: true },
  providerEventId: { ...nonEmptyString, maxlength: 160, immutable: true },
  eventType: { ...nonEmptyString, maxlength: 100, immutable: true },
  orderId: { type: objectId, ref: "MoneyTreeOrder" },
  paymentId: { type: objectId, ref: "MoneyTreePayment" },
  refundId: { type: objectId, ref: "MoneyTreeRefund" },
  cashfreeOrderId: optionalText(128),
  cashfreePaymentId: optionalText(128),
  cashfreeRefundId: optionalText(128),
  payloadDigest: { type: String, required: true, match: /^[a-f0-9]{64}$/i, immutable: true },
  processingStatus: { type: String, enum: ["received", "processing", "processed", "retry", "dead_letter"], default: "received", required: true },
  receivedAt: { type: Date, required: true, default: Date.now, immutable: true },
  processedAt: Date,
  errorCode: optionalText(64),
  errorSummary: optionalText(300),
}, { ...timestamps, collection: "webhookEvents" });

webhookEventSchema.index({ provider: 1, providerEventId: 1 }, { unique: true, name: "webhook_provider_event_unique" });
webhookEventSchema.index({ processingStatus: 1, receivedAt: 1 }, { name: "webhook_processing_queue" });

export const WebhookEventModel = registerModel("MoneyTreeWebhookEvent", webhookEventSchema) as unknown as Model<WebhookEvent>;

interface OutboxPayload {
  userId?: Types.ObjectId; orderId?: Types.ObjectId; purchaseId?: Types.ObjectId; bookingId?: Types.ObjectId; refundId?: Types.ObjectId;
  productIds?: Types.ObjectId[]; orderReference?: string; bookingReference?: string;
}
const outboxPayloadSchema = new Schema<OutboxPayload>({
  userId: { type: objectId, ref: "MoneyTreeUser" },
  orderId: { type: objectId, ref: "MoneyTreeOrder" },
  purchaseId: { type: objectId, ref: "MoneyTreePurchase" },
  bookingId: { type: objectId, ref: "MoneyTreeBooking" },
  refundId: { type: objectId, ref: "MoneyTreeRefund" },
  productIds: [{ type: objectId, ref: "MoneyTreeProduct" }],
  orderReference: { type: String, maxlength: 80 },
  bookingReference: { type: String, maxlength: 80 },
}, { _id: false, strict: "throw" });

export interface OutboxEvent {
  eventType: "purchase_confirmation" | "pdf_personalization" | "booking_confirmation" | "booking_status" | "payment_status" | "refund_confirmation";
  aggregateType: "order" | "purchase" | "booking"; aggregateId: Types.ObjectId; dedupeKey?: string;
  payload: OutboxPayload; status: "pending" | "processing" | "retry" | "sent" | "dead_letter";
  attemptCount: number; nextAttemptAt: Date; processedAt?: Date; lastErrorCode?: string; lastErrorSummary?: string;
  createdAt?: Date; updatedAt?: Date;
}

export const outboxEventSchema = new Schema<OutboxEvent>({
  eventType: { type: String, enum: ["purchase_confirmation", "pdf_personalization", "booking_confirmation", "booking_status", "payment_status", "refund_confirmation"], required: true, immutable: true },
  aggregateType: { type: String, enum: ["order", "purchase", "booking"], required: true, immutable: true },
  aggregateId: { type: objectId, required: true, immutable: true },
  dedupeKey: { type: String, trim: true, maxlength: 180, immutable: true },
  payload: { type: outboxPayloadSchema, required: true, immutable: true },
  status: { type: String, enum: ["pending", "processing", "retry", "sent", "dead_letter"], default: "pending", required: true },
  attemptCount: { type: Number, min: 0, default: 0, validate: Number.isSafeInteger },
  nextAttemptAt: { type: Date, required: true, default: Date.now },
  processedAt: Date,
  lastErrorCode: optionalText(64),
  lastErrorSummary: optionalText(300),
}, { ...timestamps, collection: "outboxEvents" });

outboxEventSchema.index({ status: 1, nextAttemptAt: 1 }, { name: "outbox_processing_queue" });
outboxEventSchema.index({ dedupeKey: 1 }, { unique: true, partialFilterExpression: { dedupeKey: { $type: "string" } }, name: "outbox_dedupe_key_unique" });
outboxEventSchema.index({ aggregateType: 1, aggregateId: 1, createdAt: -1 }, { name: "outbox_aggregate_history" });

export const OutboxEventModel = registerModel("MoneyTreeOutboxEvent", outboxEventSchema) as unknown as Model<OutboxEvent>;

export interface AuditLog {
  actorType: "admin" | "customer" | "system"; actorUserId?: Types.ObjectId; action: string; targetType: string; targetId: string;
  changedFields: string[]; reason?: string; requestId?: string; createdAt?: Date;
}

export const auditLogSchema = new Schema<AuditLog>({
  actorType: { type: String, enum: ["admin", "customer", "system"], required: true, immutable: true },
  actorUserId: { type: objectId, ref: "MoneyTreeUser", immutable: true },
  action: { ...nonEmptyString, maxlength: 100, immutable: true },
  targetType: { ...nonEmptyString, maxlength: 80, immutable: true },
  targetId: { ...nonEmptyString, maxlength: 128, immutable: true },
  changedFields: { type: [String], default: [], immutable: true, validate: { validator: (fields: string[]) => fields.every((field) => field.length > 0 && field.length <= 100), message: "Audit field names must be non-empty and bounded." } },
  reason: optionalText(1000),
  requestId: optionalText(128),
}, { timestamps: { createdAt: true, updatedAt: false }, strict: "throw", versionKey: false, collection: "auditLogs" });

auditLogSchema.pre("validate", function validateActor() {
  if (this.actorType !== "system" && !this.actorUserId) this.invalidate("actorUserId", "Human audit actions require an actor reference.");
});

auditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 }, { name: "audit_target_history" });
auditLogSchema.index({ actorUserId: 1, createdAt: -1 }, { name: "audit_actor_history" });

export const AuditLogModel = registerModel("MoneyTreeAuditLog", auditLogSchema) as unknown as Model<AuditLog>;
