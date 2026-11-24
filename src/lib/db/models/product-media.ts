import { Schema, Types } from "mongoose";
import { nonEmptyString, objectId, registerModel, timestamps } from "./common";
import type { Model } from "mongoose";

export interface ProductMedia {
  productId: Types.ObjectId;
  uploadId: string;
  kind: "thumbnail" | "promotional_video";
  status: "uploading" | "ready" | "failed";
  stagingObjectKey: string;
  objectKey?: string;
  publicUrl?: string;
  originalFileName: string;
  contentType: string;
  declaredSizeBytes: number;
  sizeBytes?: number;
  width?: number;
  height?: number;
  uploadedBy: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

export const productMediaSchema = new Schema<ProductMedia>({
  productId: { type: objectId, ref: "MoneyTreeProduct", required: true, immutable: true },
  uploadId: { ...nonEmptyString, maxlength: 36, immutable: true },
  kind: { type: String, enum: ["thumbnail", "promotional_video"], required: true, immutable: true },
  status: { type: String, enum: ["uploading", "ready", "failed"], default: "uploading", required: true },
  stagingObjectKey: { ...nonEmptyString, maxlength: 180, immutable: true, match: /^pending\/[a-f0-9]{24}\/[0-9a-f-]{36}\.upload$/i },
  objectKey: { type: String, trim: true, maxlength: 200, match: /^products\/[a-f0-9]{24}\/[0-9a-f-]{36}\.(?:jpg|png|webp|mp4|webm)$/i },
  publicUrl: { type: String, trim: true, maxlength: 2048, match: /^https:\/\//i },
  originalFileName: { ...nonEmptyString, maxlength: 180 },
  contentType: { ...nonEmptyString, maxlength: 100 },
  declaredSizeBytes: { type: Number, min: 1, required: true, validate: Number.isSafeInteger },
  sizeBytes: { type: Number, min: 1, validate: Number.isSafeInteger },
  width: { type: Number, min: 1, validate: Number.isSafeInteger },
  height: { type: Number, min: 1, validate: Number.isSafeInteger },
  uploadedBy: { type: objectId, ref: "MoneyTreeUser", required: true, immutable: true },
}, { ...timestamps, collection: "productMedia" });

productMediaSchema.index({ uploadId: 1 }, { unique: true, name: "product_media_upload_unique" });
productMediaSchema.index({ productId: 1, kind: 1, status: 1, createdAt: -1 }, { name: "product_media_selectable" });
productMediaSchema.index({ objectKey: 1 }, { unique: true, sparse: true, name: "product_media_public_key_unique" });

export const ProductMediaModel = registerModel("MoneyTreeProductMedia", productMediaSchema) as unknown as Model<ProductMedia>;
