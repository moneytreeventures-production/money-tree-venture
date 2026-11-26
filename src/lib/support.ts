import "server-only";
import { createHash, randomBytes } from "node:crypto";
import mongoose, { Types } from "mongoose";
import { z } from "zod";
import { connectToDatabase } from "@/lib/db/mongodb";
import { AuditLogModel, SupportRateModel, SupportRequestModel } from "@/lib/db/models";
import { requireAdmin } from "@/lib/auth/admin";
import { supportCategories, type SupportStatus } from "@/lib/db/models/support";
import { supportOperation } from "@/lib/support-diagnostics";

export const supportInput = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.email().max(320).transform((value) => value.toLowerCase()),
  category: z.enum(supportCategories),
  subject: z.string().trim().min(3).max(160),
  message: z.string().trim().min(10).max(5000),
  acknowledged: z.literal(true),
}).strict();
export async function submitSupport(input: unknown, requestId?: string) {
  const data = supportInput.parse(input);
  await supportOperation("database_connection", () => connectToDatabase(), requestId);
  const windowStart = new Date(Math.floor(Date.now() / 3600000) * 3600000);
  const identityHash = createHash("sha256").update(data.email + ":" + process.env.BETTER_AUTH_SECRET).digest("hex");
  const counter = await supportOperation("rate_limit_counter", () => SupportRateModel.findOneAndUpdate({ identityHash, windowStart }, { $inc: { count: 1 }, $setOnInsert: { createdAt: new Date() } }, { upsert: true, new: true }).lean().exec(), requestId);
  if (counter.count > 5) throw new Error("Too many requests. Please try later.");
  const reference = "MTV-" + randomBytes(6).toString("hex").toUpperCase();
  await supportOperation("ticket_creation", () => SupportRequestModel.create({ reference, name: data.name, email: data.email, category: data.category, subject: data.subject, message: data.message, status: "new" }), requestId);
  return { reference };
}
export async function listSupport(filters: { status?: SupportStatus; category?: string; search?: string; page: number }) {
  await requireAdmin();
  await connectToDatabase();
  const query: Record<string, unknown> = {};
  if (filters.status) query.status = filters.status;
  if (filters.category) query.category = filters.category;
  if (filters.search) query.$or = [{ reference: filters.search }, { email: filters.search.toLowerCase() }];
  const [items, total] = await Promise.all([
    SupportRequestModel.find(query).select("reference name email category subject status createdAt").sort({ createdAt: -1, _id: -1 }).skip((filters.page - 1) * 20).limit(20).lean().exec(),
    SupportRequestModel.countDocuments(query),
  ]);
  return { items: items.map((item) => ({ id: String(item._id), reference: item.reference, name: item.name, email: item.email, category: item.category, subject: item.subject, status: item.status, createdAt: item.createdAt?.toISOString() })), total };
}
export async function getSupport(id: string) {
  await requireAdmin();
  if (!Types.ObjectId.isValid(id)) throw new Error("Invalid request.");
  await connectToDatabase();
  const item = await SupportRequestModel.findById(id).lean().exec();
  if (!item) throw new Error("Request unavailable.");
  return item;
}
export async function updateSupport(id: string, input: { status?: SupportStatus; note?: string }) {
  const admin = await requireAdmin();
  if (!admin._id || !Types.ObjectId.isValid(id)) throw new Error("Invalid request.");
  const parsed = z.object({ status: z.enum(["new","in_progress","resolved","closed"]).optional(), note: z.string().trim().min(1).max(2000).optional() }).strict().parse(input);
  if (!parsed.status && !parsed.note) throw new Error("No change requested.");
  await connectToDatabase();
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const now = new Date();
      const update: { $set?: Record<string, unknown>; $push?: Record<string, unknown> } = {};
      if (parsed.status) {
        update.$set = { status: parsed.status, resolvedAt: parsed.status === "resolved" ? now : null };
        update.$push = { history: { status: parsed.status, adminId: admin._id, createdAt: now } };
      }
      if (parsed.note) update.$push = { ...update.$push, internalNotes: { text: parsed.note, adminId: admin._id, createdAt: now } };
      const item = await SupportRequestModel.findByIdAndUpdate(id, update, { new: true, session });
      if (!item) throw new Error("Request unavailable.");
      await AuditLogModel.create([{ actorType: "admin", actorUserId: admin._id, action: "support.update", targetType: "supportRequest", targetId: id, changedFields: Object.keys(parsed) }], { session });
    });
  } finally { await session.endSession(); }
  return { id };
}
