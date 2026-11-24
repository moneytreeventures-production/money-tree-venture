import { Schema, Types } from "mongoose";
import { nonEmptyString, objectId, optionalText, registerModel, timestamps } from "./common";
import type { Model } from "mongoose";

interface PurchaseBundleItem { productId: Types.ObjectId; productName: string; productSlug: string; assetId: Types.ObjectId; assetVersion: string }
const purchaseBundleItemSchema = new Schema<PurchaseBundleItem>({
  productId: { type: objectId, ref: "MoneyTreeProduct", required: true, immutable: true },
  productName: { ...nonEmptyString, maxlength: 160, immutable: true },
  productSlug: { ...nonEmptyString, maxlength: 180, immutable: true },
  assetId: { type: objectId, ref: "MoneyTreeProductAsset", required: true, immutable: true },
  assetVersion: { ...nonEmptyString, maxlength: 64, immutable: true },
}, { _id: false, strict: "throw" });

export interface Purchase {
  userId: Types.ObjectId; orderId: Types.ObjectId; orderLineId: Types.ObjectId; productId: Types.ObjectId;
  productType: "pdf" | "pdf_bundle" | "call_guidance"; entitlementType: "download" | "booking";
  bundleItems: PurchaseBundleItem[]; accessStatus: "active" | "revoked"; grantedAt: Date;
  revokedAt?: Date; revocationReason?: string; revocationAuditId?: Types.ObjectId; createdAt?: Date; updatedAt?: Date;
}

export const purchaseSchema = new Schema<Purchase>({
  userId: { type: objectId, ref: "MoneyTreeUser", required: true, immutable: true },
  orderId: { type: objectId, ref: "MoneyTreeOrder", required: true, immutable: true },
  orderLineId: { type: objectId, required: true, immutable: true },
  productId: { type: objectId, ref: "MoneyTreeProduct", required: true, immutable: true },
  productType: { type: String, enum: ["pdf", "pdf_bundle", "call_guidance"], required: true, immutable: true },
  entitlementType: { type: String, enum: ["download", "booking"], required: true, immutable: true },
  bundleItems: { type: [purchaseBundleItemSchema], default: [], immutable: true },
  accessStatus: { type: String, enum: ["active", "revoked"], default: "active", required: true },
  grantedAt: { type: Date, required: true, default: Date.now, immutable: true },
  revokedAt: Date,
  revocationReason: optionalText(500),
  revocationAuditId: { type: objectId, ref: "MoneyTreeAuditLog" },
}, { ...timestamps, collection: "purchases" });

purchaseSchema.pre("validate", function validatePurchaseKind() {
  if (this.productType === "call_guidance" && (this.entitlementType !== "booking" || this.bundleItems.length > 0)) {
    this.invalidate("entitlementType", "Call Guidance must grant a booking entitlement and cannot include PDFs.");
  }
  if (this.productType !== "call_guidance" && this.entitlementType !== "download") {
    this.invalidate("entitlementType", "PDF products must grant a downloadable entitlement.");
  }
  if (this.productType === "pdf_bundle" && !this.bundleItems.length) {
    this.invalidate("bundleItems", "A bundle purchase must snapshot all included PDF products and versions.");
  }
  if (this.productType !== "pdf_bundle" && this.bundleItems.length > 0) {
    this.invalidate("bundleItems", "Only a bundle purchase may contain bundle item snapshots.");
  }
  if (this.accessStatus === "revoked" && (!this.revokedAt || !this.revocationReason)) {
    this.invalidate("accessStatus", "Revoked entitlements require a timestamp and reason.");
  }
});

purchaseSchema.index({ orderLineId: 1 }, { unique: true, name: "purchase_order_line_unique" });
purchaseSchema.index({ userId: 1, productId: 1, grantedAt: -1 }, { name: "purchase_user_product_history" });
purchaseSchema.index({ userId: 1, accessStatus: 1, grantedAt: -1 }, { name: "purchase_customer_access" });
purchaseSchema.index({ productId: 1, accessStatus: 1 }, { name: "purchase_product_access" });

export const PurchaseModel = registerModel("MoneyTreePurchase", purchaseSchema) as unknown as Model<Purchase>;

export interface PersonalizedPdf {
  purchaseId: Types.ObjectId; userId: Types.ObjectId; productId: Types.ObjectId;
  sourceAssetId: Types.ObjectId; sourceAssetVersion: string; objectKey: string;
  status: "pending" | "ready" | "failed"; sizeBytes?: number; sha256?: string;
  generatedAt?: Date; watermarkVersion?: number; failureCode?: string; createdAt?: Date; updatedAt?: Date;
}

export const personalizedPdfSchema = new Schema<PersonalizedPdf>({
  purchaseId: { type: objectId, ref: "MoneyTreePurchase", required: true, immutable: true },
  userId: { type: objectId, ref: "MoneyTreeUser", required: true, immutable: true },
  productId: { type: objectId, ref: "MoneyTreeProduct", required: true, immutable: true },
  sourceAssetId: { type: objectId, ref: "MoneyTreeProductAsset", required: true, immutable: true },
  sourceAssetVersion: { ...nonEmptyString, maxlength: 64, immutable: true },
  objectKey: {
    ...nonEmptyString, maxlength: 1024, immutable: true,
    validate: { validator: (key: string) => /^personalized\/[A-Za-z0-9][A-Za-z0-9_-]{0,99}\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.pdf$/i.test(key), message: "Personalized PDF object key is invalid." },
  },
  status: { type: String, enum: ["pending", "ready", "failed"], default: "pending", required: true },
  sizeBytes: { type: Number, min: 1, validate: Number.isSafeInteger },
  sha256: { type: String, match: /^[a-f0-9]{64}$/i },
  generatedAt: Date,
  watermarkVersion: { type: Number, min: 1, validate: Number.isSafeInteger },
  failureCode: optionalText(80),
}, { ...timestamps, collection: "personalizedPdfs" });

personalizedPdfSchema.pre("validate", function validateGeneratedPdf() {
  if (this.status === "ready" && (!this.sizeBytes || !this.sha256 || !this.generatedAt)) {
    this.invalidate("status", "A ready customer PDF requires size, checksum, and generation time.");
  }
});

personalizedPdfSchema.index({ purchaseId: 1, sourceAssetId: 1 }, { unique: true, name: "personalized_pdf_purchase_asset_unique" });
personalizedPdfSchema.index({ userId: 1, purchaseId: 1, status: 1 }, { name: "personalized_pdf_customer_access" });
export const PersonalizedPdfModel = registerModel("MoneyTreePersonalizedPdf", personalizedPdfSchema) as unknown as Model<PersonalizedPdf>;

export interface DownloadLog {
  userId: Types.ObjectId; purchaseId: Types.ObjectId; personalizedPdfId: Types.ObjectId;
  result: "issued" | "denied" | "rate_limited"; failureCode?: string; createdAt?: Date;
}

export const downloadLogSchema = new Schema<DownloadLog>({
  userId: { type: objectId, ref: "MoneyTreeUser", required: true, immutable: true },
  purchaseId: { type: objectId, ref: "MoneyTreePurchase", required: true, immutable: true },
  personalizedPdfId: { type: objectId, ref: "MoneyTreePersonalizedPdf", required: true, immutable: true },
  result: { type: String, enum: ["issued", "denied", "rate_limited"], required: true, immutable: true },
  failureCode: optionalText(80),
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false, strict: "throw", collection: "downloadLogs" });

downloadLogSchema.index({ userId: 1, createdAt: -1 }, { name: "download_user_history" });
downloadLogSchema.index({ purchaseId: 1, createdAt: -1 }, { name: "download_purchase_history" });
export const DownloadLogModel = registerModel("MoneyTreeDownloadLog", downloadLogSchema) as unknown as Model<DownloadLog>;

export interface DownloadRateLimit { userId: Types.ObjectId; windowStart: Date; requestCount: number; createdAt?: Date }
export const downloadRateLimitSchema = new Schema<DownloadRateLimit>({
  userId: { type: objectId, ref: "MoneyTreeUser", required: true, immutable: true },
  windowStart: { type: Date, required: true, immutable: true },
  requestCount: { type: Number, min: 1, required: true, validate: Number.isSafeInteger },
}, { timestamps: true, collection: "downloadRateLimits" });
downloadRateLimitSchema.index({ userId: 1, windowStart: 1 }, { unique: true, name: "download_rate_user_window_unique" });
downloadRateLimitSchema.index({ createdAt: 1 }, { expireAfterSeconds: 172800, name: "download_rate_ttl" });
export const DownloadRateLimitModel = registerModel("MoneyTreeDownloadRateLimit", downloadRateLimitSchema) as unknown as Model<DownloadRateLimit>;

interface RequestedSlot { startsAt: Date; endsAt: Date; timezone: string }
const requestedSlotSchema = new Schema<RequestedSlot>({
  startsAt: { type: Date, required: true },
  endsAt: { type: Date, required: true },
  timezone: { ...nonEmptyString, maxlength: 64 },
}, { _id: false, strict: "throw" });

requestedSlotSchema.pre("validate", function validateSlot() {
  if (this.endsAt <= this.startsAt) this.invalidate("endsAt", "Requested slot must end after it starts.");
});

export interface Booking {
  bookingReference: string; userId: Types.ObjectId; orderId: Types.ObjectId; purchaseId: Types.ObjectId; productId: Types.ObjectId;
  status: "awaiting_scheduling" | "scheduled" | "confirmed" | "completed" | "cancelled"; requestedSlots: RequestedSlot[];
  timezone?: string; scheduledStartAt?: Date; scheduledEndAt?: Date; sessionDurationMinutes: number;
  schedulingInstructions: string; customerNotes?: string; adminNotes?: string; assignedAdminId?: Types.ObjectId;
  completedAt?: Date; cancelledAt?: Date; cancellationReason?: string; createdAt?: Date; updatedAt?: Date;
}

export const bookingSchema = new Schema<Booking>({
  bookingReference: { ...nonEmptyString, maxlength: 80, immutable: true },
  userId: { type: objectId, ref: "MoneyTreeUser", required: true, immutable: true },
  orderId: { type: objectId, ref: "MoneyTreeOrder", required: true, immutable: true },
  purchaseId: { type: objectId, ref: "MoneyTreePurchase", required: true, immutable: true },
  productId: { type: objectId, ref: "MoneyTreeProduct", required: true, immutable: true },
  status: { type: String, enum: ["awaiting_scheduling", "scheduled", "confirmed", "completed", "cancelled"], default: "awaiting_scheduling", required: true },
  requestedSlots: { type: [requestedSlotSchema], default: [], validate: { validator: (slots: unknown[]) => Array.isArray(slots) && slots.length <= 5, message: "A booking can contain at most five requested slots." } },
  timezone: optionalText(64),
  scheduledStartAt: Date,
  scheduledEndAt: Date,
  sessionDurationMinutes: { type: Number, required: true, min: 1, max: 480, validate: Number.isSafeInteger, immutable: true },
  schedulingInstructions: { ...nonEmptyString, maxlength: 4000, immutable: true },
  customerNotes: optionalText(2000),
  adminNotes: optionalText(4000),
  assignedAdminId: { type: objectId, ref: "MoneyTreeUser" },
  completedAt: Date,
  cancelledAt: Date,
  cancellationReason: optionalText(500),
}, { ...timestamps, collection: "bookings" });

bookingSchema.pre("validate", function validateBookingSchedule() {
  if (this.status === "scheduled" || this.status === "confirmed") {
    if (!this.scheduledStartAt || !this.scheduledEndAt || !this.timezone) {
      this.invalidate("scheduledStartAt", "A scheduled booking requires start, end, and timezone values.");
    } else if (this.scheduledEndAt <= this.scheduledStartAt) {
      this.invalidate("scheduledEndAt", "A scheduled booking must end after it starts.");
    }
  }
  if (this.status === "completed" && !this.completedAt) this.invalidate("completedAt", "Completed bookings require a completion timestamp.");
  if (this.status === "cancelled" && !this.cancelledAt) this.invalidate("cancelledAt", "Cancelled bookings require a cancellation timestamp.");
});

bookingSchema.index({ bookingReference: 1 }, { unique: true, name: "booking_reference_unique" });
bookingSchema.index({ purchaseId: 1 }, { unique: true, name: "booking_purchase_unique" });
bookingSchema.index({ userId: 1, status: 1, updatedAt: -1 }, { name: "booking_customer_status" });
bookingSchema.index({ status: 1, scheduledStartAt: 1 }, { name: "booking_admin_schedule" });

export const BookingModel = registerModel("MoneyTreeBooking", bookingSchema) as unknown as Model<Booking>;
