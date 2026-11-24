import { Schema, Types, type Model } from "mongoose";
import { objectId, registerModel, timestamps } from "./common";
export interface CheckoutClaim { userId: Types.ObjectId; productId: Types.ObjectId; orderId: Types.ObjectId; status: "active" | "completed" | "released" | "refunded"; releasedAt?: Date; completedAt?: Date; createdAt?: Date; updatedAt?: Date }
export const checkoutClaimSchema = new Schema<CheckoutClaim>({
  userId: { type: objectId, required: true, immutable: true },
  productId: { type: objectId, required: true, immutable: true },
  orderId: { type: objectId, required: true, immutable: true },
  status: { type: String, enum: ["active", "completed", "released", "refunded"], required: true, default: "active" },
  releasedAt: Date,
  completedAt: Date,
}, { ...timestamps, collection: "checkoutClaims" });
checkoutClaimSchema.index({ userId: 1, productId: 1 }, { unique: true, partialFilterExpression: { status: "active" }, name: "checkout_claim_one_active_product" });
checkoutClaimSchema.index({ orderId: 1, status: 1 }, { name: "checkout_claim_order_status" });
export const CheckoutClaimModel = registerModel("MoneyTreeCheckoutClaim", checkoutClaimSchema) as unknown as Model<CheckoutClaim>;
