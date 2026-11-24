import { Schema } from "mongoose";
import { nonEmptyString, optionalText, registerModel, timestamps } from "./common";
import type { Model } from "mongoose";

export interface User {
  _id?: import("mongoose").Types.ObjectId;
  authUserId: string; name: string; email: string; emailNormalized: string; imageRef?: string;
  role: "customer" | "admin"; status: "active" | "blocked" | "deleted"; lastLoginAt?: Date;
  createdAt?: Date; updatedAt?: Date;
}

export const userSchema = new Schema<User>({
  authUserId: { ...nonEmptyString, maxlength: 128 },
  name: { ...nonEmptyString, maxlength: 120 },
  email: { ...nonEmptyString, maxlength: 320, lowercase: true, trim: true, match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
  emailNormalized: { type: String, maxlength: 320, lowercase: true, trim: true, match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
  imageRef: optionalText(2048),
  role: { type: String, enum: ["customer", "admin"], default: "customer", required: true },
  status: { type: String, enum: ["active", "blocked", "deleted"], default: "active", required: true },
  lastLoginAt: Date,
}, { ...timestamps, collection: "users" });

userSchema.pre("validate", function normalizeUserEmail() {
  if (this.email) this.emailNormalized = this.email.trim().toLowerCase();
});

userSchema.index({ authUserId: 1 }, { unique: true, name: "user_auth_id_unique" });
// Email is intentionally non-unique: provider account linking is handled by the future auth system.
userSchema.index({ emailNormalized: 1 }, { name: "user_email_lookup" });
userSchema.index({ role: 1, status: 1 }, { name: "user_role_status" });

export const UserModel = registerModel("MoneyTreeUser", userSchema) as unknown as Model<User>;
