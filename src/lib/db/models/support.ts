import { Schema, Types, type Model } from "mongoose";
import { objectId, registerModel, timestamps } from "./common";
export type SupportStatus = "new" | "in_progress" | "resolved" | "closed";
export const supportCategories = ["general", "product", "order", "download", "booking", "grievance", "other"] as const;
export interface SupportRequest {
  reference: string; name: string; email: string; category: typeof supportCategories[number];
  subject: string; message: string; status: SupportStatus;
  internalNotes: { text: string; adminId: Types.ObjectId; createdAt: Date }[];
  history: { status: SupportStatus; adminId: Types.ObjectId; createdAt: Date }[];
  resolvedAt?: Date; createdAt?: Date; updatedAt?: Date;
}
const note = new Schema({ text: { type: String, required: true, maxlength: 2000 }, adminId: { type: objectId, required: true }, createdAt: { type: Date, required: true } }, { _id: false });
const history = new Schema({ status: { type: String, enum: ["new","in_progress","resolved","closed"], required: true }, adminId: { type: objectId, required: true }, createdAt: { type: Date, required: true } }, { _id: false });
export const supportRequestSchema = new Schema<SupportRequest>({
  reference: { type: String, required: true, unique: true, immutable: true },
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
  email: { type: String, required: true, trim: true, lowercase: true, maxlength: 320 },
  category: { type: String, enum: supportCategories, required: true },
  subject: { type: String, required: true, trim: true, minlength: 3, maxlength: 160 },
  message: { type: String, required: true, trim: true, minlength: 10, maxlength: 5000 },
  status: { type: String, enum: ["new","in_progress","resolved","closed"], required: true, default: "new" },
  internalNotes: { type: [note], default: [] },
  history: { type: [history], default: [] },
  resolvedAt: Date,
}, { ...timestamps, collection: "supportRequests" });
supportRequestSchema.index({ status: 1, createdAt: -1 });
supportRequestSchema.index({ category: 1, status: 1, createdAt: -1 });
export const SupportRequestModel = registerModel("MoneyTreeSupportRequest", supportRequestSchema) as unknown as Model<SupportRequest>;

export interface SupportRate { identityHash: string; windowStart: Date; count: number; createdAt?: Date }
export const supportRateSchema = new Schema<SupportRate>({ identityHash: { type: String, required: true }, windowStart: { type: Date, required: true }, count: { type: Number, required: true, default: 0 }, createdAt: { type: Date, default: Date.now } }, { collection: "supportRates" });
supportRateSchema.index({ identityHash: 1, windowStart: 1 }, { unique: true });
supportRateSchema.index({ createdAt: 1 }, { expireAfterSeconds: 172800 });
export const SupportRateModel = registerModel("MoneyTreeSupportRate", supportRateSchema) as unknown as Model<SupportRate>;
