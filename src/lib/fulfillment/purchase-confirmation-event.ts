import type { Types } from "mongoose";
import type { OutboxEvent } from "../db/models/reliability";

export function buildOrderPurchaseConfirmationEvent(order: {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  orderReference: string;
}, now = new Date()): Pick<OutboxEvent, "eventType" | "aggregateType" | "aggregateId" | "dedupeKey" | "payload" | "status" | "attemptCount" | "nextAttemptAt"> {
  return {
    eventType: "purchase_confirmation",
    aggregateType: "order",
    aggregateId: order._id,
    dedupeKey: `purchase-confirmation:${order._id.toString()}`,
    payload: { userId: order.userId, orderId: order._id, orderReference: order.orderReference },
    status: "pending",
    attemptCount: 0,
    nextAttemptAt: now,
  };
}
