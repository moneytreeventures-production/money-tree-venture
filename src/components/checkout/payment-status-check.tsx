"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { classifyCustomerPaymentStatus, startPaymentStatusPolling } from "../../lib/payments/cashfree/status-polling";

interface StatusResponse {
  success?: boolean;
  data?: { orderStatus?: string; paymentStatus?: string };
  error?: { message?: string };
}

export function PaymentStatusCheck({ orderId, autoCheck = false }: { orderId: string; autoCheck?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const inFlight = useRef(false);

  const checkStatus = useCallback(async (_orderId?: string, signal?: AbortSignal) => {
    if (inFlight.current) return "pending" as const;
    inFlight.current = true;
    setBusy(true);
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/payments/status`, { cache: "no-store", signal });
      const result = await response.json() as StatusResponse;
      if (signal?.aborted) return "unknown" as const;
      if (!response.ok || !result.success || !result.data) {
        setMessage(result.error?.message ?? "Payment status could not be checked. Please try again.");
        return "unknown" as const;
      }
      const status = classifyCustomerPaymentStatus(result.data.orderStatus, result.data.paymentStatus);
      if (status === "paid") {
        setMessage("Payment confirmed. Your order is successful.");
        router.refresh();
        return "paid" as const;
      } else if (result.data.paymentStatus === "pending" || result.data.paymentStatus === "unpaid") {
        setMessage("We're still confirming your payment. Please check the status before trying again.");
        return "pending" as const;
      } else if (result.data.paymentStatus === "failed") {
        if (status !== "failed") {
          setMessage("This payment attempt failed. We are confirming when a new checkout is safe.");
          return "pending" as const;
        }
        setMessage("Payment expired. You can start a new checkout.");
        router.refresh();
        return "failed" as const;
      } else {
        setMessage("Order status was updated. Review the latest status below.");
        return "unknown" as const;
      }
    } catch {
      if (!signal?.aborted) setMessage("Payment status could not be checked. Please try again.");
      return "unknown" as const;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, [orderId, router]);

  useEffect(() => {
    if (!autoCheck) return;
    return startPaymentStatusPolling([orderId], (_id, signal) => checkStatus(_id, signal));
  }, [autoCheck, checkStatus, orderId]);

  return (
    <div className="mt-4">
      <button type="button" onClick={() => void checkStatus()} disabled={busy} className="min-h-11 rounded-full border border-border px-5 text-sm font-semibold text-foreground transition hover:bg-surface-secondary focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-60">
        {busy ? "Checking payment status..." : "Check payment status"}
      </button>
      <p role={message ? "status" : undefined} aria-live="polite" className="mt-2 min-h-5 text-sm text-foreground-secondary">{message}</p>
    </div>
  );
}
