/** Read-only classification. The actual write path remains recordVerifiedPaymentStatus. */
export function classifyPaymentRecovery(input: {
  localPaymentStatus: string;
  providerOrders: readonly {
    status: string; identityMatches: boolean; amountMatches: boolean;
    paymentStatuses: readonly { status: string; identityMatches: boolean; amountMatches: boolean }[];
  }[];
}): "already_paid" | "verified_success_candidate" | "failed_attempt_candidate" | "unresolved" | "mismatch_or_review" | "no_provider_order" {
  if (input.providerOrders.length === 0) return "no_provider_order";
  const trusted = input.providerOrders.filter((order) => order.identityMatches && order.amountMatches);
  if (trusted.length !== input.providerOrders.length || trusted.some((order) => order.paymentStatuses.some((payment) => !payment.identityMatches || !payment.amountMatches))) {
    return "mismatch_or_review";
  }
  if (trusted.some((order) => order.status === "PAID" && order.paymentStatuses.some((payment) => payment.status === "SUCCESS"))) {
    return input.localPaymentStatus === "paid" ? "already_paid" : "verified_success_candidate";
  }
  if (trusted.some((order) => order.paymentStatuses.some((payment) => payment.status === "PENDING")) ||
      trusted.some((order) => order.status === "ACTIVE" && order.paymentStatuses.length === 0)) return "unresolved";
  if (trusted.some((order) => order.paymentStatuses.some((payment) => ["FAILED", "USER_DROPPED", "NOT_ATTEMPTED"].includes(payment.status)))) {
    return "failed_attempt_candidate";
  }
  return "unresolved";
}
