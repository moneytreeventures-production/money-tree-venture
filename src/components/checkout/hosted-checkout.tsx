"use client";

import Script from "next/script";
import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { formatINR } from "@/lib/format/currency";
import { normalizeIndianMobilePhone } from "@/lib/payments/cashfree/mobile-phone";
import { paymentFailureMessage, PHONE_VALIDATION_MESSAGE } from "@/lib/payments/cashfree/payment-feedback";

interface CashfreeCheckoutInstance {
  checkout(options: { paymentSessionId: string; redirectTarget: "_self" }): Promise<unknown>;
}

declare global {
  interface Window {
    Cashfree?: (options: { mode: "sandbox" | "production" }) => CashfreeCheckoutInstance;
  }
}

interface HostedCheckoutProps { orderId: string; orderReference: string; totalPaise: number }
interface PaymentResponse {
  success?: boolean;
  data?: { paymentSessionId?: string; environment?: "sandbox" | "production" };
  error?: { code?: string; details?: Array<{ field?: string }> };
}

export function HostedCheckout({ orderId, orderReference, totalPaise }: HostedCheckoutProps) {
  const [phone, setPhone] = useState("");
  const [attemptKey, setAttemptKey] = useState(() => crypto.randomUUID());
  const [sdkReady, setSdkReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const starting = useRef(false);

  async function startCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (starting.current) return;
    starting.current = true;
    setMessage("");
    const validPhone = normalizeIndianMobilePhone(phone);
    if (!validPhone) { setMessage(PHONE_VALIDATION_MESSAGE); starting.current = false; return; }
    setBusy(true);
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/payments`, {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": attemptKey },
        body: JSON.stringify({ phone: validPhone }),
      });
      const payload = await response.json() as PaymentResponse;
      if (!response.ok || !payload.data?.paymentSessionId || !payload.data.environment) {
        setMessage(paymentFailureMessage(payload.error));
        return;
      }
      if (!sdkReady || !window.Cashfree) {
        setMessage("Secure checkout did not load. Refresh this page and try again.");
        return;
      }
      const cashfree = window.Cashfree({ mode: payload.data.environment });
      await cashfree.checkout({ paymentSessionId: payload.data.paymentSessionId, redirectTarget: "_self" });
    } catch {
      setMessage("Payment checkout is temporarily unavailable. The server will safely reuse the same payment request if you retry. Please try again shortly.");
    } finally {
      starting.current = false;
      setBusy(false);
    }
  }

  return (
    <section className="mt-8 w-full min-w-0 rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-8">
      <Script src="https://sdk.cashfree.com/js/v3/cashfree.js" strategy="afterInteractive" onReady={() => setSdkReady(true)} />
      <h2 className="text-xl font-semibold text-foreground">Pay with Cashfree</h2>
      <p className="mt-2 break-words text-sm leading-6 text-foreground-secondary">Order {orderReference} · {formatINR(totalPaise)}</p>
      <form className="mt-6 min-w-0 space-y-4" onSubmit={startCheckout} noValidate>
        <label className="block text-sm font-medium text-foreground" htmlFor="checkout-phone">Mobile number</label>
        <input
          id="checkout-phone"
          autoComplete="tel-national"
          inputMode="numeric"
          pattern="[6-9][0-9]{9}"
          maxLength={20}
          required
          value={phone}
          onChange={(event) => { setPhone(event.target.value.replace(/\D/g, "")); setMessage(""); setAttemptKey(crypto.randomUUID()); }}
          className="w-full min-w-0 rounded-xl border border-border bg-background px-4 py-3 text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-accent"
          aria-describedby="checkout-phone-help"
        />
        <p id="checkout-phone-help" className="text-xs text-foreground-secondary">Enter your 10-digit mobile number for Cashfree payment.</p>
        <button
          type="submit"
          disabled={busy || !sdkReady}
          className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-accent px-6 py-3 text-sm font-semibold text-foreground transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Connecting to Cashfree securely…" : sdkReady ? "Pay with Cashfree" : "Loading secure checkout…"}
        </button>
        <p className="text-center text-xs leading-5 text-foreground-secondary">Payment status is verified with Cashfree. A browser redirect does not activate a purchase.</p>
        <p className="min-h-5 text-sm text-rose-700 dark:text-rose-300" role={message ? "alert" : undefined} aria-live="polite">{message}</p>
      </form>
    </section>
  );
}
