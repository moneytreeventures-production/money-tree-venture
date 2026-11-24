import type { Types } from "mongoose";
import { ConflictError } from "../errors/app-error";

type BookingStatus = "awaiting_scheduling" | "scheduled" | "confirmed" | "completed" | "cancelled";

export function assertBookingTransition(current: BookingStatus, next: BookingStatus): void {
  const allowed = current === "awaiting_scheduling"
    ? ["scheduled", "cancelled"]
    : current === "scheduled"
      ? ["scheduled", "confirmed", "cancelled"]
      : current === "confirmed" ? ["completed", "cancelled"]
      : [];
  if (!allowed.includes(next)) throw new ConflictError();
}

export function bookingEntitlementFilter(input: {
  purchaseId: Types.ObjectId;
  userId: Types.ObjectId;
  orderId: Types.ObjectId;
  productId: Types.ObjectId;
}) {
  return {
    _id: input.purchaseId,
    userId: input.userId,
    orderId: input.orderId,
    productId: input.productId,
    productType: "call_guidance",
    entitlementType: "booking",
    accessStatus: "active",
  } as const;
}

export function verifiedBookingPaymentFilter(input: { userId: Types.ObjectId; orderId: Types.ObjectId; amountPaise: number; gatewayEnvironment: "sandbox" | "production" }) {
  return { orderId: input.orderId, userId: input.userId, status: "success", providerStatus: "SUCCESS", amountPaise: input.amountPaise, currency: "INR", gatewayEnvironment: input.gatewayEnvironment, cashfreeOrderId: { $type: "string" }, cashfreePaymentId: { $type: "string" } } as const;
}
