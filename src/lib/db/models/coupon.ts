import { Schema, Types } from "mongoose";
import { isUniqueList, objectId, paise, registerModel, timestamps } from "./common";
import type { Model } from "mongoose";

export interface Coupon {
  code: string; discountType: "fixed" | "percentage"; discountValue: number; minimumOrderPaise: number;
  maximumDiscountPaise?: number; validFrom: Date; validUntil: Date; totalRedemptionLimit?: number;
  perCustomerRedemptionLimit?: number; allowedProductIds: Types.ObjectId[]; allowedCategoryIds: Types.ObjectId[];
  reservationSequence: number;
  status: "active" | "inactive" | "archived"; createdBy?: Types.ObjectId; createdAt?: Date; updatedAt?: Date;
}

export const couponSchema = new Schema<Coupon>({
  code: { type: String, required: true, trim: true, uppercase: true, minlength: 3, maxlength: 64, match: /^[A-Z0-9][A-Z0-9_-]*$/ },
  discountType: { type: String, enum: ["fixed", "percentage"], required: true },
  // Fixed values are paise; percentage values are basis points (10000 = 100%).
  discountValue: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  minimumOrderPaise: { type: Number, min: 0, validate: Number.isSafeInteger, default: 0 },
  maximumDiscountPaise: { type: Number, min: 0, validate: Number.isSafeInteger },
  validFrom: { type: Date, required: true },
  validUntil: { type: Date, required: true },
  totalRedemptionLimit: { type: Number, min: 1, validate: Number.isSafeInteger },
  perCustomerRedemptionLimit: { type: Number, min: 1, validate: Number.isSafeInteger },
  allowedProductIds: { type: [{ type: objectId, ref: "MoneyTreeProduct" }], default: [], validate: { validator: isUniqueList, message: "Product restrictions cannot contain duplicates." } },
  allowedCategoryIds: { type: [{ type: objectId, ref: "MoneyTreeCategory" }], default: [], validate: { validator: isUniqueList, message: "Category restrictions cannot contain duplicates." } },
  status: { type: String, enum: ["active", "inactive", "archived"], default: "inactive", required: true },
  reservationSequence: { type: Number, min: 0, default: 0, required: true, validate: Number.isSafeInteger, select: false },
  createdBy: { type: objectId, ref: "MoneyTreeUser" },
}, { ...timestamps, collection: "coupons" });

couponSchema.pre("validate", function validateCoupon() {
  if (this.validUntil <= this.validFrom) this.invalidate("validUntil", "Coupon end must be after its start.");
  if (this.discountType === "percentage" && this.discountValue > 10_000) {
    this.invalidate("discountValue", "Percentage discount must not exceed 100 percent (10000 basis points).");
  }
  if (this.discountType === "fixed" && this.maximumDiscountPaise !== undefined) {
    this.invalidate("maximumDiscountPaise", "Maximum discount applies only to percentage coupons.");
  }
});

couponSchema.index({ code: 1 }, { unique: true, partialFilterExpression: { status: "active" }, name: "coupon_active_code_unique" });
couponSchema.index({ status: 1, validFrom: 1, validUntil: 1 }, { name: "coupon_validity_lookup" });

export const CouponModel = registerModel("MoneyTreeCoupon", couponSchema) as unknown as Model<Coupon>;

export interface CouponRedemption {
  couponId: Types.ObjectId; userId: Types.ObjectId; orderId: Types.ObjectId; discountPaise: number;
  status: "reserved" | "redeemed" | "released"; reservedAt: Date; reservationExpiresAt?: Date;
  redeemedAt?: Date; releasedAt?: Date; createdAt?: Date; updatedAt?: Date;
}

export const couponRedemptionSchema = new Schema<CouponRedemption>({
  couponId: { type: objectId, ref: "MoneyTreeCoupon", required: true, immutable: true },
  userId: { type: objectId, ref: "MoneyTreeUser", required: true, immutable: true },
  orderId: { type: objectId, ref: "MoneyTreeOrder", required: true, immutable: true },
  discountPaise: { ...paise, immutable: true },
  status: { type: String, enum: ["reserved", "redeemed", "released"], default: "reserved", required: true },
  reservedAt: { type: Date, required: true, default: Date.now, immutable: true },
  reservationExpiresAt: Date,
  redeemedAt: Date,
  releasedAt: Date,
}, { ...timestamps, collection: "couponRedemptions" });

couponRedemptionSchema.index({ couponId: 1, orderId: 1 }, { unique: true, name: "coupon_redemption_order_unique" });
couponRedemptionSchema.index({ couponId: 1, userId: 1, status: 1 }, { name: "coupon_redemption_customer_count" });
couponRedemptionSchema.index({ status: 1, reservationExpiresAt: 1 }, { name: "coupon_redemption_expiry" });

export const CouponRedemptionModel = registerModel("MoneyTreeCouponRedemption", couponRedemptionSchema) as unknown as Model<CouponRedemption>;
