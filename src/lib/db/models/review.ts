import { Schema, Types, type Model } from "mongoose";
import { objectId, registerModel, timestamps } from "./common";
import { isValidReviewDesignation, MAX_REVIEW_DESIGNATION_LENGTH } from "../../review-designation";

export interface Review {
  productId: Types.ObjectId;
  customerId: Types.ObjectId;
  rating: number;
  title?: string;
  text: string;
  displayName: string;
  designation?: string;
  status: "pending" | "approved" | "rejected";
  verifiedPurchase: boolean;
  moderatedAt?: Date;
  moderatorId?: Types.ObjectId;
  moderationReason?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export const reviewSchema = new Schema<Review>({
  productId: { type: objectId, ref: "MoneyTreeProduct", required: true, immutable: true },
  customerId: { type: objectId, ref: "MoneyTreeUser", required: true, immutable: true },
  rating: { type: Number, required: true, min: 1, max: 5, validate: Number.isInteger },
  title: { type: String, trim: true, maxlength: 100 },
  text: { type: String, required: true, trim: true, minlength: 10, maxlength: 2000 },
  displayName: { type: String, required: true, trim: true, maxlength: 40 },
  designation: { type: String, trim: true, maxlength: MAX_REVIEW_DESIGNATION_LENGTH, validate: isValidReviewDesignation },
  status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending", required: true },
  verifiedPurchase: { type: Boolean, required: true, immutable: true },
  moderatedAt: Date,
  moderatorId: { type: objectId, ref: "MoneyTreeUser" },
  moderationReason: { type: String, trim: true, maxlength: 500 },
}, { ...timestamps, collection: "reviews" });

reviewSchema.index({ customerId: 1, productId: 1 }, { unique: true, name: "review_one_per_customer_product" });
reviewSchema.index({ productId: 1, status: 1, createdAt: -1 }, { name: "review_public_product" });
reviewSchema.index({ status: 1, createdAt: -1 }, { name: "review_moderation_queue" });
export const ReviewModel = registerModel("MoneyTreeReview", reviewSchema) as unknown as Model<Review>;
