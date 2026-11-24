import mongoose, { Schema, type Model } from "mongoose";

export const objectId = Schema.Types.ObjectId;
export const timestamps = { timestamps: true, strict: "throw" as const };

export const nonEmptyString = {
  type: String,
  required: true,
  trim: true,
  minlength: 1,
};

export const optionalText = (maxLength: number) => ({
  type: String,
  trim: true,
  minlength: 1,
  maxlength: maxLength,
});

export const paise = {
  type: Number,
  required: true,
  min: 0,
  validate: {
    validator: Number.isSafeInteger,
    message: "Amount must be an integer number of paise.",
  },
};

export const optionalPaise = {
  type: Number,
  min: 0,
  validate: {
    validator: (value: number | undefined) => value === undefined || Number.isSafeInteger(value),
    message: "Amount must be an integer number of paise.",
  },
};

export function registerModel(name: string, schema: Schema): Model<Record<string, unknown>> {
  return (mongoose.models[name] as Model<Record<string, unknown>> | undefined)
    ?? (mongoose.model(name, schema) as unknown as Model<Record<string, unknown>>);
}

export function isUniqueList(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  const normalized = value.map((id) => String(id));
  return new Set(normalized).size === normalized.length;
}
