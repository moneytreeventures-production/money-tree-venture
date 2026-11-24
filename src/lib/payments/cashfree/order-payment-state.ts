export type VerifiedOrderPaymentOutcome = "refund_locked" | "first_success" | "late_success" | "duplicate_success" | "pending" | "failure" | "preserve_paid" | "unknown";

export function isRefundLockedPaymentState(orderStatus: string, paymentStatus: string): boolean {
  return orderStatus === "partially_refunded" || orderStatus === "refunded" ||
    paymentStatus === "partially_refunded" || paymentStatus === "refunded";
}

/** Classify provider evidence without ever treating an unrecognized status as success. */
export function classifyVerifiedOrderPayment(input: {
  orderStatus: string; paymentStatus: string; providerStatus: string; expiresAt?: Date; now: Date;
}): VerifiedOrderPaymentOutcome {
  if (isRefundLockedPaymentState(input.orderStatus, input.paymentStatus)) return "refund_locked";
  const status = input.providerStatus.toUpperCase();
  if (status === "SUCCESS") {
    if (input.paymentStatus === "paid") return "duplicate_success";
    const late = input.orderStatus === "expired" || input.orderStatus === "cancelled" ||
      (input.expiresAt !== undefined && input.expiresAt <= input.now);
    return late ? "late_success" : "first_success";
  }
  if (input.paymentStatus === "paid") return "preserve_paid";
  if (status === "PENDING") return "pending";
  if (status === "FAILED" || status === "NOT_ATTEMPTED" || status === "USER_DROPPED") return "failure";
  return "unknown";
}

export function canReusePendingPaymentAttempt(input: {
  status: string; storedRequestHash?: string; requestedHash: string;
}): boolean {
  return input.status === "pending" && input.storedRequestHash === input.requestedHash;
}

export function canInitiatePaymentForOrder(input: { orderStatus: string; paymentStatus: string; expiresAt?: Date }, now: Date): boolean {
  return input.orderStatus === "awaiting_payment" && ["unpaid", "pending"].includes(input.paymentStatus) &&
    input.expiresAt instanceof Date && input.expiresAt > now;
}

/** This diagnosed historical order awaits the owner's separate guarded recovery approval. */
export function isOwnerHeldHistoricalRecovery(orderId: string, orderStatus: string): boolean {
  return orderId === "6b0341108ffd602387cde275" && orderStatus === "awaiting_payment";
}

/** An individual failed attempt is insufficient; every provider order must be terminal. */
export function canFinalizeVerifiedExpiredOrder(orders: readonly {
  status: string; identityMatches: boolean; amountMatches: boolean;
  payments: readonly { status: string; identityMatches: boolean; amountMatches: boolean }[];
}[]): boolean {
  return orders.length > 0 && orders.every((order) => order.status === "EXPIRED" && order.identityMatches && order.amountMatches &&
    order.payments.every((payment) => payment.identityMatches && payment.amountMatches &&
      ["FAILED", "USER_DROPPED", "NOT_ATTEMPTED"].includes(payment.status)));
}
