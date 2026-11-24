import "server-only";
import mongoose, { Types } from "mongoose";
import { z } from "zod";
import { connectToDatabase } from "@/lib/db/mongodb";
import { AuditLogModel, OrderModel, ProductModel, PurchaseModel, ReviewModel } from "@/lib/db/models";
import { requireCustomer } from "@/lib/auth/session";
import { requireAdmin } from "@/lib/auth/admin";

export const reviewInput = z.object({
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().max(100).optional(),
  text: z.string().trim().min(10).max(2000),
}).strict();

export async function submitReview(productId: string, input: unknown) {
  const customer = await requireCustomer();
  if (!customer._id || !Types.ObjectId.isValid(productId)) throw new Error("Review unavailable.");
  const data = reviewInput.parse(input);
  await connectToDatabase();
  const product = await ProductModel.exists({ _id: new Types.ObjectId(productId), publicationStatus: "published" });
  if (!product) throw new Error("Product unavailable.");
  const purchase = await PurchaseModel.findOne({ userId: customer._id, productId: new Types.ObjectId(productId), accessStatus: "active" }).lean().exec();
  if (!purchase) throw new Error("A verified purchase is required.");
  const order = await OrderModel.exists({ _id: purchase.orderId, userId: customer._id, orderStatus: "paid", paymentStatus: "paid" });
  if (!order) throw new Error("A verified purchase is required.");
  const displayName = (customer.name.includes("@") ? "Customer" : customer.name.split(/\s+/)[0] || "Customer").slice(0, 40);
  try {
    return await ReviewModel.create({ productId: new Types.ObjectId(productId), customerId: customer._id, ...data, displayName, status: "pending", verifiedPurchase: true });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) throw new Error("You have already reviewed this product.");
    throw error;
  }
}

export async function publicReviews(productId: string, limit = 20) {
  if (!Types.ObjectId.isValid(productId)) return { items: [], count: 0, average: null };
  await connectToDatabase();
  const id = new Types.ObjectId(productId);
  const [items, aggregate] = await Promise.all([
    ReviewModel.find({ productId: id, status: "approved" }).select("rating title text displayName verifiedPurchase createdAt").sort({ createdAt: -1, _id: -1 }).limit(limit).lean().exec(),
    ReviewModel.aggregate<{ _id: null; count: number; average: number }>([{ $match: { productId: id, status: "approved" } }, { $group: { _id: null, count: { $sum: 1 }, average: { $avg: "$rating" } } }]),
  ]);
  return { items: items.map((item) => ({ id: String(item._id), rating: item.rating, title: item.title, text: item.text, displayName: item.displayName, verifiedPurchase: item.verifiedPurchase, createdAt: item.createdAt?.toISOString() })), count: aggregate[0]?.count ?? 0, average: aggregate[0] ? Math.round(aggregate[0].average * 10) / 10 : null };
}

export async function homepageReviews() {
  await connectToDatabase();
  const reviews = await ReviewModel.find({ status: "approved", verifiedPurchase: true }).select("productId rating text displayName createdAt").sort({ createdAt: -1, _id: -1 }).limit(8).lean().exec();
  const products = await ProductModel.find({ _id: { $in: reviews.map((r) => r.productId) }, publicationStatus: "published" }).select("name slug").lean().exec();
  const byId = new Map(products.map((p) => [String(p._id), p]));
  return reviews.filter((r) => byId.has(String(r.productId))).map((r) => ({ id: String(r._id), rating: r.rating, text: r.text, displayName: r.displayName, product: byId.get(String(r.productId))!.name, slug: byId.get(String(r.productId))!.slug }));
}

export async function moderationQueue(status: "pending" | "approved" | "rejected") {
  await requireAdmin();
  await connectToDatabase();
  const items = await ReviewModel.find({ status }).sort({ createdAt: -1, _id: -1 }).limit(50).lean().exec();
  const products = await ProductModel.find({ _id: { $in: items.map((item) => item.productId) } }).select("name").lean().exec();
  const names = new Map(products.map((product) => [String(product._id), product.name]));
  return items.map((item) => ({ id: String(item._id), productName: names.get(String(item.productId)) ?? "Unavailable product", productId: String(item.productId), rating: item.rating, text: item.text, displayName: item.displayName, verifiedPurchase: item.verifiedPurchase, status: item.status, createdAt: item.createdAt?.toISOString() }));
}

export async function moderateReview(id: string, status: "approved" | "rejected") {
  const admin = await requireAdmin();
  if (!admin._id || !Types.ObjectId.isValid(id)) throw new Error("Invalid review.");
  await connectToDatabase();
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const review = await ReviewModel.findOneAndUpdate(
        { _id: new Types.ObjectId(id), status: status === "approved" ? "pending" : { $in: ["pending", "approved"] } },
        { $set: { status, moderatedAt: new Date(), moderatorId: admin._id } },
        { new: true, session },
      );
      if (!review) throw new Error("Review unavailable for moderation.");
      await AuditLogModel.create([{ actorType: "admin", actorUserId: admin._id, action: "review." + status, targetType: "review", targetId: id, changedFields: ["status"] }], { session });
    });
  } finally {
    await session.endSession();
  }
  return { id, status };
}
