import { Schema, Types } from "mongoose";
import { nonEmptyString, objectId, optionalText, paise, registerModel, timestamps } from "./common";
import type { Model } from "mongoose";

interface AssetSnapshot { assetId: Types.ObjectId; version: string; sha256?: string }
const assetSnapshotSchema = new Schema<AssetSnapshot>({
  assetId: { type: objectId, ref: "MoneyTreeProductAsset", required: true, immutable: true },
  version: { ...nonEmptyString, maxlength: 64, immutable: true },
  sha256: { type: String, match: /^[a-f0-9]{64}$/i, immutable: true },
}, { _id: false, strict: "throw" });

interface BundleItemSnapshot { productId: Types.ObjectId; name: string; slug: string; asset: AssetSnapshot }
const bundleItemSnapshotSchema = new Schema<BundleItemSnapshot>({
  productId: { type: objectId, ref: "MoneyTreeProduct", required: true, immutable: true },
  name: { ...nonEmptyString, maxlength: 160, immutable: true },
  slug: { ...nonEmptyString, maxlength: 180, immutable: true },
  asset: { type: assetSnapshotSchema, required: true, immutable: true },
}, { _id: false, strict: "throw" });

export interface OrderLine {
  productId: Types.ObjectId; productName: string; productSlug: string;
  productType: "pdf" | "pdf_bundle" | "call_guidance"; quantity: number;
  bundleKind?: "starter_kit" | "bundle";
  unitPricePaise: number; lineSubtotalPaise: number; discountPaise: number; taxPaise: number; lineTotalPaise: number;
  asset?: AssetSnapshot; includedProducts: BundleItemSnapshot[]; callDurationMinutes?: number;
  fulfilmentInstructions?: string; _id?: Types.ObjectId;
}

export const orderLineSchema = new Schema<OrderLine>({
  productId: { type: objectId, ref: "MoneyTreeProduct", required: true, immutable: true },
  productName: { ...nonEmptyString, maxlength: 160, immutable: true },
  productSlug: { ...nonEmptyString, maxlength: 180, immutable: true },
  productType: { type: String, enum: ["pdf", "pdf_bundle", "call_guidance"], required: true, immutable: true },
  bundleKind: { type: String, enum: ["starter_kit", "bundle"], immutable: true },
  quantity: { type: Number, required: true, min: 1, validate: Number.isSafeInteger, immutable: true },
  unitPricePaise: { ...paise, immutable: true },
  lineSubtotalPaise: { ...paise, immutable: true },
  discountPaise: { ...paise, immutable: true, default: 0 },
  taxPaise: { ...paise, immutable: true, default: 0 },
  lineTotalPaise: { ...paise, immutable: true },
  asset: { type: assetSnapshotSchema, immutable: true },
  includedProducts: { type: [bundleItemSnapshotSchema], default: [], immutable: true },
  callDurationMinutes: { type: Number, min: 1, max: 480, validate: Number.isSafeInteger, immutable: true },
  fulfilmentInstructions: { type: String, trim: true, maxlength: 4000, immutable: true },
}, { _id: true, strict: "throw" });

orderLineSchema.pre("validate", function validateOrderLine() {
  if (this.lineSubtotalPaise !== this.unitPricePaise * this.quantity) {
    this.invalidate("lineSubtotalPaise", "Line subtotal must equal unit price multiplied by quantity.");
  }
  if (this.discountPaise > this.lineSubtotalPaise || this.lineTotalPaise !== this.lineSubtotalPaise - this.discountPaise) {
    this.invalidate("lineTotalPaise", "Line total must equal subtotal minus discount.");
  }
  if (this.taxPaise > this.lineTotalPaise) this.invalidate("taxPaise", "Inclusive tax cannot exceed the line total.");

  if (this.productType === "pdf" && (!this.asset || this.includedProducts.length > 0)) {
    this.invalidate("asset", "A PDF order line needs its asset version snapshot and cannot contain bundle products.");
  }
  if (this.productType === "pdf_bundle" && (!this.includedProducts.length || this.asset)) {
    this.invalidate("includedProducts", "A bundle order line needs included PDF snapshots and cannot have one direct asset.");
  }
  if (this.productType === "pdf_bundle" && !this.bundleKind) {
    this.invalidate("bundleKind", "A bundle order line needs its immutable bundle kind.");
  }
  if (this.productType !== "pdf_bundle" && this.bundleKind) {
    this.invalidate("bundleKind", "Only a bundle order line can have a bundle kind.");
  }
  if (this.productType === "call_guidance" && (this.asset || this.includedProducts.length > 0 || !this.callDurationMinutes || !this.fulfilmentInstructions)) {
    this.invalidate("productType", "Call Guidance requires a duration and cannot contain downloadable assets.");
  }
  if (this.productType !== "call_guidance" && this.fulfilmentInstructions) {
    this.invalidate("fulfilmentInstructions", "Only Call Guidance can contain fulfilment instructions.");
  }
});

interface CustomerSnapshot { name: string; email: string }
interface CouponSnapshot { couponId?: Types.ObjectId; code?: string; discountPaise?: number }
interface TaxSnapshot { rateBasisPoints: number; calculationVersion: string }
export interface Order {
  orderReference: string; userId: Types.ObjectId; gatewayEnvironment: "sandbox" | "production";
  customerSnapshot: CustomerSnapshot; lines: OrderLine[]; subtotalPaise: number; discountPaise: number;
  taxPaise: number; totalPaise: number; currency: "INR"; couponSnapshot?: CouponSnapshot;
  taxSnapshot: TaxSnapshot;
  orderStatus: "awaiting_payment" | "paid" | "expired" | "cancelled" | "partially_refunded" | "refunded";
  paymentStatus: "unpaid" | "pending" | "paid" | "failed" | "partially_refunded" | "refunded";
  checkoutIdempotencyKey?: string; paidAt?: Date; expiresAt?: Date; refundedAt?: Date; createdByRequestId?: string;
  archivedAt?: Date;
  checkoutRequestHash?: string;
  createdAt?: Date; updatedAt?: Date;
}

export const orderSchema = new Schema<Order>({
  orderReference: { ...nonEmptyString, maxlength: 80, immutable: true },
  userId: { type: objectId, ref: "MoneyTreeUser", required: true, immutable: true },
  gatewayEnvironment: { type: String, enum: ["sandbox", "production"], required: true, immutable: true },
  customerSnapshot: {
    name: { ...nonEmptyString, maxlength: 120, immutable: true },
    email: { ...nonEmptyString, maxlength: 320, lowercase: true, immutable: true },
  },
  lines: { type: [orderLineSchema], required: true, immutable: true, validate: { validator: (v: unknown[]) => Array.isArray(v) && v.length > 0, message: "An order must contain at least one line." } },
  subtotalPaise: { ...paise, immutable: true },
  discountPaise: { ...paise, default: 0, immutable: true },
  taxPaise: { ...paise, default: 0, immutable: true },
  taxSnapshot: {
    rateBasisPoints: { type: Number, min: 0, max: 10_000, validate: Number.isSafeInteger, required: true, immutable: true },
    calculationVersion: { ...nonEmptyString, maxlength: 64, immutable: true },
  },
  totalPaise: { ...paise, immutable: true },
  currency: { type: String, enum: ["INR"], default: "INR", required: true, immutable: true },
  couponSnapshot: {
    couponId: { type: objectId, ref: "MoneyTreeCoupon", immutable: true },
    code: { type: String, trim: true, uppercase: true, maxlength: 64, immutable: true },
    discountPaise: { type: Number, min: 0, validate: Number.isSafeInteger, immutable: true },
  },
  orderStatus: { type: String, enum: ["awaiting_payment", "paid", "expired", "cancelled", "partially_refunded", "refunded"], default: "awaiting_payment", required: true },
  paymentStatus: { type: String, enum: ["unpaid", "pending", "paid", "failed", "partially_refunded", "refunded"], default: "unpaid", required: true },
  checkoutIdempotencyKey: { type: String, trim: true, maxlength: 128 },
  checkoutRequestHash: { type: String, match: /^[a-f0-9]{64}$/i, immutable: true, select: false },
  paidAt: Date,
  expiresAt: Date,
  refundedAt: Date,
  archivedAt: Date,
  createdByRequestId: optionalText(128),
}, { ...timestamps, collection: "orders" });

orderSchema.pre("validate", function validateOrderTotals() {
  const lineSubtotal = this.lines.reduce((sum, line) => sum + line.lineSubtotalPaise, 0);
  const lineDiscount = this.lines.reduce((sum, line) => sum + line.discountPaise, 0);
  const lineTax = this.lines.reduce((sum, line) => sum + line.taxPaise, 0);
  const lineTotal = this.lines.reduce((sum, line) => sum + line.lineTotalPaise, 0);
  if (this.subtotalPaise !== lineSubtotal) this.invalidate("subtotalPaise", "Order subtotal must equal its line subtotals.");
  if (this.discountPaise !== lineDiscount) this.invalidate("discountPaise", "Order discount must equal its allocated line discounts.");
  if (this.taxPaise !== lineTax) this.invalidate("taxPaise", "Order tax must equal its line tax snapshots.");
  if (this.totalPaise !== lineTotal || this.totalPaise !== this.subtotalPaise - this.discountPaise) {
    this.invalidate("totalPaise", "Order total must equal the sum of line totals.");
  }
  if (this.taxPaise > this.totalPaise) this.invalidate("taxPaise", "Inclusive tax cannot exceed the order total.");
});

orderSchema.index({ orderReference: 1 }, { unique: true, name: "order_reference_unique" });
orderSchema.index({ userId: 1, createdAt: -1 }, { name: "order_customer_created" });
orderSchema.index({ orderStatus: 1, createdAt: -1 }, { name: "order_status_created" });
orderSchema.index({ userId: 1, checkoutIdempotencyKey: 1 }, { unique: true, partialFilterExpression: { checkoutIdempotencyKey: { $type: "string" } }, name: "order_checkout_idempotency" });

export const OrderModel = registerModel("MoneyTreeOrder", orderSchema) as unknown as Model<Order>;

export interface Payment {
  paymentReference: string; orderId: Types.ObjectId; userId: Types.ObjectId; gatewayEnvironment: "sandbox" | "production";
  checkoutRequestKey?: string; gatewayIdempotencyKey?: string;
  attemptRequestHash?: string;
  cashfreeOrderId?: string; cashfreePaymentId?: string; amountPaise: number; currency: "INR";
  status: "pending" | "success" | "failed" | "interrupted"; providerStatus?: string; paymentMethod?: string;
  providerReference?: string; failureCode?: string; failureSummary?: string; paidAt?: Date; lastEventAt?: Date;
  createdAt?: Date; updatedAt?: Date;
}

export const paymentSchema = new Schema<Payment>({
  paymentReference: { ...nonEmptyString, maxlength: 80, immutable: true },
  checkoutRequestKey: { type: String, trim: true, maxlength: 128, immutable: true },
  gatewayIdempotencyKey: { type: String, trim: true, match: /^[0-9a-f-]{36}$/i, immutable: true },
  attemptRequestHash: { type: String, match: /^[a-f0-9]{64}$/i, immutable: true, select: false },
  orderId: { type: objectId, ref: "MoneyTreeOrder", required: true, immutable: true },
  userId: { type: objectId, ref: "MoneyTreeUser", required: true, immutable: true },
  gatewayEnvironment: { type: String, enum: ["sandbox", "production"], required: true, immutable: true },
  cashfreeOrderId: { type: String, trim: true, maxlength: 128 },
  cashfreePaymentId: { type: String, trim: true, maxlength: 128 },
  amountPaise: { ...paise, immutable: true },
  currency: { type: String, enum: ["INR"], default: "INR", required: true, immutable: true },
  status: { type: String, enum: ["pending", "success", "failed", "interrupted"], default: "pending", required: true },
  providerStatus: optionalText(64),
  paymentMethod: optionalText(64),
  providerReference: optionalText(128),
  failureCode: optionalText(64),
  failureSummary: optionalText(300),
  paidAt: Date,
  lastEventAt: Date,
}, { ...timestamps, collection: "payments" });

paymentSchema.index({ paymentReference: 1 }, { unique: true, name: "payment_reference_unique" });
paymentSchema.index({ cashfreeOrderId: 1, createdAt: -1 }, { name: "payment_cashfree_order_attempts" });
paymentSchema.index({ cashfreePaymentId: 1 }, { unique: true, partialFilterExpression: { cashfreePaymentId: { $type: "string" } }, name: "payment_cashfree_payment_unique" });
paymentSchema.index({ userId: 1, orderId: 1, checkoutRequestKey: 1 }, { unique: true, partialFilterExpression: { checkoutRequestKey: { $type: "string" } }, name: "payment_checkout_request_unique" });
paymentSchema.index({ orderId: 1, createdAt: -1 }, { name: "payment_order_created" });
paymentSchema.index({ userId: 1, createdAt: -1 }, { name: "payment_customer_created" });

export const PaymentModel = registerModel("MoneyTreePayment", paymentSchema) as unknown as Model<Payment>;
