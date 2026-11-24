export interface ExpiredFailureEvidence {
  localOrderStatus: string;
  localPaymentStatus: string;
  localExpiresAt?: Date;
  activeClaims: number;
  purchases: number;
  providerOrders: readonly {
    status: string;
    identityMatches: boolean;
    amountMatches: boolean;
    payments: readonly { status: string; identityMatches: boolean; amountMatches: boolean }[];
  }[];
}

export type ExpiredFailureDecision = "eligible" | "already_recovered" | "local_state_changed" |
  "local_window_open" | "unexpected_entitlement" | "claim_count_changed" | "provider_mismatch" |
  "provider_not_expired" | "provider_unresolved" | "provider_success" | "no_failed_attempt";

/** Deliberately narrow: a failed attempt alone never establishes a terminal order. */
export function decideExpiredFailureRecovery(input: ExpiredFailureEvidence, now: Date): ExpiredFailureDecision {
  if (input.providerOrders.length === 0 || input.providerOrders.some((order) => !order.identityMatches || !order.amountMatches ||
    order.payments.some((payment) => !payment.identityMatches || !payment.amountMatches))) return "provider_mismatch";
  if (input.providerOrders.some((order) => order.payments.some((payment) => payment.status === "SUCCESS"))) return "provider_success";
  if (input.providerOrders.some((order) => order.status !== "EXPIRED")) return "provider_not_expired";
  if (input.providerOrders.some((order) => order.payments.length === 0 || order.payments.some((payment) =>
    !["FAILED", "USER_DROPPED", "NOT_ATTEMPTED"].includes(payment.status)))) return "provider_unresolved";
  if (!input.providerOrders.some((order) => order.payments.some((payment) => payment.status === "FAILED"))) return "no_failed_attempt";
  if (input.localOrderStatus === "expired" && input.localPaymentStatus === "failed" && input.activeClaims === 0 && input.purchases === 0) return "already_recovered";
  if (input.localOrderStatus !== "awaiting_payment" || !["pending", "failed"].includes(input.localPaymentStatus)) return "local_state_changed";
  if (!input.localExpiresAt || input.localExpiresAt > now) return "local_window_open";
  if (input.purchases !== 0) return "unexpected_entitlement";
  if (input.activeClaims !== 1) return "claim_count_changed";
  return "eligible";
}
