import type { ClientSession, Types } from "mongoose";
import { OrderModel, type Order } from "../db/models";
import { ConflictError } from "../errors/app-error";

export type OrderLifecycleChanges = Partial<Pick<Order, "orderStatus" | "paymentStatus" | "paidAt" | "refundedAt">>;
export type ExpectedOrderLifecycle = Pick<Order, "orderStatus" | "paymentStatus"> & { updatedAt?: Date };

/** Persist only mutable lifecycle fields with optimistic concurrency inside the caller's transaction. */
export async function persistOrderLifecycleChanges(input: {
  orderId: Types.ObjectId;
  userId: Types.ObjectId;
  session: ClientSession;
  expected: ExpectedOrderLifecycle;
  changes: OrderLifecycleChanges;
}): Promise<void> {
  if (Object.keys(input.changes).length === 0) return;
  const result = await OrderModel.updateOne({
    _id: input.orderId,
    userId: input.userId,
    orderStatus: input.expected.orderStatus,
    paymentStatus: input.expected.paymentStatus,
    ...(input.expected.updatedAt ? { updatedAt: input.expected.updatedAt } : {}),
  }, { $set: input.changes }, { session: input.session, runValidators: true });
  if (result.matchedCount !== 1) throw new ConflictError("Order status changed during reconciliation. Check the status again.");
}
