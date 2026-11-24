export const PAYMENT_STATUS_RETRY_DELAYS_MS = [800, 1800, 3500] as const;

export type PaymentStatusCheckResult = "paid" | "failed" | "pending" | "unknown";

export function classifyCustomerPaymentStatus(orderStatus?: string, paymentStatus?: string): PaymentStatusCheckResult {
  if (orderStatus === "paid" && paymentStatus === "paid") return "paid";
  if (orderStatus === "expired" && paymentStatus === "failed") return "failed";
  if (["pending", "unpaid", "failed"].includes(paymentStatus ?? "") && orderStatus === "awaiting_payment") return "pending";
  return "unknown";
}

export function shouldRetryPaymentStatus(status: PaymentStatusCheckResult): boolean {
  return status === "pending" || status === "unknown";
}

/** One bounded browser polling session. Hidden tabs pause without using up a retry. */
export function startPaymentStatusPolling(
  orderIds: readonly string[],
  check: (orderId: string, signal: AbortSignal) => Promise<PaymentStatusCheckResult>,
  delaysMs: readonly number[] = [0, 4000, 12000, 30000],
): () => void {
  const remaining = new Set(orderIds);
  let stopped = false;
  let round = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active: AbortController | undefined;

  const schedule = () => {
    if (stopped || document.hidden || active || timer || round >= delaysMs.length || remaining.size === 0) return;
    timer = setTimeout(() => { timer = undefined; void runRound(); }, delaysMs[round]);
  };
  const runRound = async () => {
    if (stopped || document.hidden) return;
    const controller = new AbortController();
    active = controller;
    for (const id of [...remaining]) {
      if (stopped || controller.signal.aborted) break;
      let status: PaymentStatusCheckResult = "unknown";
      try { status = await check(id, controller.signal); } catch { /* Retry transient provider or network errors. */ }
      if (!controller.signal.aborted && !shouldRetryPaymentStatus(status)) remaining.delete(id);
    }
    active = undefined;
    if (!stopped && !controller.signal.aborted) round++;
    schedule();
  };
  const onVisibilityChange = () => {
    if (document.hidden) {
      if (timer) clearTimeout(timer);
      timer = undefined;
      active?.abort();
    } else schedule();
  };
  document.addEventListener("visibilitychange", onVisibilityChange);
  schedule();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    active?.abort();
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
}
