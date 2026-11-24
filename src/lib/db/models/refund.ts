import { Schema, Types } from "mongoose";
import { nonEmptyString, objectId, paise, registerModel, timestamps } from "./common";
import type { Model } from "mongoose";

export interface Refund {
  orderId: Types.ObjectId; paymentId: Types.ObjectId; userId: Types.ObjectId; adminUserId?: Types.ObjectId;
  gatewayEnvironment: "sandbox" | "production"; cashfreeOrderId: string; cashfreePaymentId: string; refundId: string; idempotencyKey?: string;
  amountPaise: number; currency: "INR"; reason: string;
  status: "processing" | "pending" | "success" | "failed";
  cashfreeRefundId?: string; providerStatus?: string; providerArn?: string;
  requestedAt: Date; processedAt?: Date; createdAt?: Date; updatedAt?: Date;
}

export const refundSchema = new Schema<Refund>({
  orderId: { type: objectId, ref: "MoneyTreeOrder", required: true, immutable: true },
  paymentId: { type: objectId, ref: "MoneyTreePayment", required: true, immutable: true },
  userId: { type: objectId, ref: "MoneyTreeUser", required: true, immutable: true },
  adminUserId: { type: objectId, ref: "MoneyTreeUser", immutable: true },
  gatewayEnvironment: { type: String, enum: ["sandbox", "production"], required: true, immutable: true },
  cashfreeOrderId: { ...nonEmptyString, maxlength: 128, immutable: true },
  cashfreePaymentId: { ...nonEmptyString, maxlength: 128, immutable: true },
  refundId: { ...nonEmptyString, maxlength: 40, match: /^[A-Za-z0-9_-]{3,40}$/, immutable: true },
  idempotencyKey: { type: String, trim: true, maxlength: 36, match: /^[0-9a-f-]{36}$/i, immutable: true },
  amountPaise: { ...paise, immutable: true },
  currency: { type: String, enum: ["INR"], default: "INR", required: true, immutable: true },
  reason: { ...nonEmptyString, maxlength: 100, immutable: true },
  status: { type: String, enum: ["processing", "pending", "success", "failed"], default: "processing", required: true },
  cashfreeRefundId: { type: String, trim: true, maxlength: 128 },
  providerStatus: { type: String, trim: true, maxlength: 64 },
  providerArn: { type: String, trim: true, maxlength: 128 },
  requestedAt: { type: Date, required: true, immutable: true, default: Date.now },
  processedAt: Date,
}, { ...timestamps, collection: "refunds" });

refundSchema.index({ cashfreeOrderId: 1, refundId: 1 }, { unique: true, name: "refund_merchant_id_unique" });
refundSchema.index({ idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string" } }, name: "refund_idempotency_unique" });
refundSchema.index({ orderId: 1, createdAt: -1 }, { name: "refund_order_history" });
refundSchema.index({ status: 1, updatedAt: 1 }, { name: "refund_reconciliation_queue" });
export const RefundModel = registerModel("MoneyTreeRefund", refundSchema) as unknown as Model<Refund>;
