"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, CircleAlert, LoaderCircle } from "lucide-react";
import { formatINR } from "@/lib/format/currency";
import { classifyCustomerPaymentStatus, startPaymentStatusPolling, type PaymentStatusCheckResult } from "@/lib/payments/cashfree/status-polling";
import { RetryExpiredOrder } from "./retry-expired-order";
import { paymentResultDestinations, paymentResultState } from "@/lib/payments/cashfree/result-presentation";

interface ResultOrder {
  id: string; orderReference: string; totalPaise: number; orderStatus: string; paymentStatus: string;
  lines: Array<{ productName: string; productType: string; quantity: number; includedProducts: Array<{ name: string }> }>;
}

export function PaymentResult({ initialOrder }: { initialOrder: ResultOrder }) {
  const [order, setOrder] = useState(initialOrder);
  const [message, setMessage] = useState("");
  const state: PaymentStatusCheckResult = classifyCustomerPaymentStatus(order.orderStatus, order.paymentStatus);
  const needsCheck = state === "pending" || state === "unknown";

  useEffect(() => {
    if (!needsCheck) return;
    let active = true;
    const stop = startPaymentStatusPolling([order.id], async (_id, signal) => {
      try {
        const response = await fetch(`/api/orders/${encodeURIComponent(order.id)}/payments/status`, { credentials: "same-origin", cache: "no-store", signal });
        const payload = await response.json() as { success?: boolean; data?: ResultOrder; error?: { message?: string } };
        if (!response.ok || !payload.success || !payload.data) {
          if (!signal.aborted && active) setMessage("We could not confirm the result yet. You can check again from your order page.");
          return "unknown";
        }
        if (!signal.aborted && active) {
          setOrder(payload.data);
          setMessage("");
        }
        return classifyCustomerPaymentStatus(payload.data.orderStatus, payload.data.paymentStatus);
      } catch {
        if (!signal.aborted && active) setMessage("Payment verification is taking longer than usual. Your order remains safe while we check.");
        return "unknown";
      }
    });
    return () => { active = false; stop(); };
  }, [needsCheck, order.id]);

  const presentation = paymentResultState(order);
  const terminalFailed = presentation === "failed";
  const paid = presentation === "success";
  const { library: hasDownloads, bookings: hasConsultation } = paymentResultDestinations(order.lines);

  return <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-8 sm:py-16">
    <section aria-live="polite" aria-atomic="true" className={`rounded-3xl border bg-surface p-6 shadow-sm motion-safe:animate-in motion-safe:fade-in sm:p-10 ${paid ? "border-emerald-300 dark:border-emerald-800" : terminalFailed ? "border-orange-300 dark:border-orange-800" : "border-border"}`}>
      <div className="mx-auto grid max-w-xl justify-items-center text-center">
        {paid ? <CheckCircle2 aria-hidden="true" className="size-16 text-emerald-600 dark:text-emerald-400" />
          : terminalFailed ? <CircleAlert aria-hidden="true" className="size-16 text-orange-600 dark:text-orange-400" />
            : <LoaderCircle aria-hidden="true" className="size-14 animate-spin text-accent-foreground motion-reduce:animate-none" />}
        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-foreground-secondary">Payment status</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          {paid ? "Payment Successful!" : terminalFailed ? "Payment Unsuccessful" : "Verifying Your Payment"}
        </h1>
        <p className="mt-4 text-base leading-7 text-foreground-secondary">
          {paid ? "Your payment has been confirmed." : terminalFailed ? "This payment did not complete and the order has closed. You can review the order or start a fresh checkout at current prices." : "We are confirming your payment securely with Cashfree. Please wait before starting another checkout."}
        </p>
        {!paid && !terminalFailed && <p role="status" className="sr-only">Payment verification in progress</p>}
        {message && <p role="status" className="mt-3 text-sm text-foreground-secondary">{message}</p>}
      </div>

      <div className="mx-auto mt-8 max-w-xl rounded-2xl border border-border bg-background p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <span className="text-sm text-foreground-secondary">Order {order.orderReference}</span>
          <span className="text-lg font-semibold text-foreground">{formatINR(order.totalPaise)}</span>
        </div>
        <ul className="mt-4 space-y-3">{order.lines.map((line, index) => <li key={`${line.productName}-${index}`} className="text-sm text-foreground">
          <p>{line.productName} <span className="text-foreground-secondary">× {line.quantity}</span></p>
          {line.includedProducts.length > 0 && <p className="mt-1 text-xs text-foreground-secondary">Includes {line.includedProducts.map((item) => item.name).join(", ")}</p>}
        </li>)}</ul>
      </div>

      {paid && <p className="mx-auto mt-5 max-w-xl text-center text-sm leading-6 text-foreground-secondary">
        {hasDownloads ? "Your verified PDF access is available in My Library. Personalized downloads are prepared securely when requested." : "Your consultation booking is available from your account."}
      </p>}
      <nav aria-label="Payment result actions" className="mx-auto mt-7 flex max-w-xl flex-col justify-center gap-3 sm:flex-row">
        {paid && hasDownloads && <Link href="/account/library" className="inline-flex min-h-12 items-center justify-center rounded-full bg-accent px-6 text-sm font-semibold text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">Go to My Library</Link>}
        {paid && hasConsultation && <Link href="/account/bookings" className="inline-flex min-h-12 items-center justify-center rounded-full bg-accent px-6 text-sm font-semibold text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">View Consultation Booking</Link>}
        {terminalFailed && <RetryExpiredOrder orderId={order.id} />}
        <Link href={`/checkout/${encodeURIComponent(order.id)}`} className="inline-flex min-h-12 items-center justify-center rounded-full border border-border px-6 text-sm font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">View Order</Link>
      </nav>
    </section>
  </main>;
}
