export function canExpireOrder(input: {
  orderStatus: string; paymentStatus: string; expiresAt?: Date; hasPendingPaymentAttempt: boolean; now: Date;
}): boolean {
  return input.orderStatus === "awaiting_payment" &&
    input.paymentStatus !== "pending" && input.paymentStatus !== "paid" &&
    input.expiresAt !== undefined && input.expiresAt <= input.now &&
    !input.hasPendingPaymentAttempt;
}
