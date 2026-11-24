"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCart } from "@/components/cart/cart-provider";
import { canRetryExpiredOrder, retryOrderProductIds } from "@/lib/checkout/retry-order";

interface StatusResponse {
  success?: boolean;
  data?: { orderStatus?: string; paymentStatus?: string; lines?: Array<{ productId?: string }> };
  error?: { message?: string };
}

/** Restore only product IDs; the new checkout checks publication, ownership and current prices. */
export function RetryExpiredOrder({ orderId }: { orderId: string }) {
  const router = useRouter();
  const { items, ready, addItem, clearCart } = useCart();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const inFlight = useRef(false);

  async function retry() {
    if (inFlight.current || !ready) return;
    inFlight.current = true;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/payments/status`, { credentials: "same-origin", cache: "no-store" });
      const result = await response.json() as StatusResponse;
      if (!response.ok || !result.success || !result.data) throw new Error(result.error?.message ?? "Payment status could not be confirmed. Try again later.");
      if (!canRetryExpiredOrder(result.data)) {
        router.refresh();
        throw new Error(result.data.paymentStatus === "paid" ? "This order is already paid. Check My Library." : "Payment status is still being confirmed. Please wait before retrying.");
      }
      if (items.length > 0) throw new Error("Your cart already contains products. Review your cart before starting another checkout.");
      const productIds = retryOrderProductIds(result.data.lines);
      if (!productIds) throw new Error("This order cannot be restored automatically. Please choose the products again.");
      for (const productId of productIds) {
        if (!addItem(productId)) {
          clearCart();
          throw new Error("The cart could not be restored. Please choose the products again.");
        }
      }
      router.push("/checkout");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Payment retry could not be started. Please try again.");
    } finally { inFlight.current = false; setBusy(false); }
  }

  return <div className="flex flex-wrap items-center gap-3">
    <button type="button" disabled={busy || !ready} onClick={() => void retry()} className="inline-flex min-h-11 items-center justify-center rounded-full bg-accent px-5 text-sm font-semibold text-accent-foreground transition hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60">
      {busy ? "Checking payment…" : "Try Payment Again"}
    </button>
    {message && <p role="alert" className="w-full text-sm text-foreground-secondary">{message} <Link href="/cart" className="font-semibold underline">Review cart</Link></p>}
  </div>;
}
