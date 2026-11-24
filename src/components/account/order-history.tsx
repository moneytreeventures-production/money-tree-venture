"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CustomerOrderView, OrderHistoryTab } from "@/lib/checkout/order-service";
import { orderStatusLabel } from "@/lib/checkout/order-presentation";
import { formatINR } from "@/lib/format/currency";
import { classifyCustomerPaymentStatus, startPaymentStatusPolling, type PaymentStatusCheckResult } from "@/lib/payments/cashfree/status-polling";
import { RetryExpiredOrder } from "@/components/checkout/retry-expired-order";

const tabs: Array<{ key: OrderHistoryTab; label: string }> = [
  { key: "all", label: "All Orders" }, { key: "processing", label: "Processing" },
  { key: "completed", label: "Completed" }, { key: "closed", label: "Cancelled / Failed / Expired" },
  { key: "archived", label: "Archived" },
];

function pageHref(tab: OrderHistoryTab, page: number) { return `/account/orders?tab=${tab}&page=${page}`; }

export function OrderHistory({ orders, tab, page, pageCount, total }: { orders: CustomerOrderView[]; tab: OrderHistoryTab; page: number; pageCount: number; total: number }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const inFlightIds = useRef(new Set<string>());
  const refreshedFailedIds = useRef(new Set<string>());
  const pendingOrderIds = orders.filter((order) => order.paymentStatus === "pending" ||
    (order.paymentStatus === "failed" && order.orderStatus === "awaiting_payment")).map((order) => order.id).filter(Boolean).join(",");

  useEffect(() => {
    if (!pendingOrderIds) return;
    return startPaymentStatusPolling(pendingOrderIds.split(","), async (id, signal): Promise<PaymentStatusCheckResult> => {
      if (inFlightIds.current.has(id)) return "pending";
      inFlightIds.current.add(id);
      try {
        const response = await fetch(`/api/orders/${encodeURIComponent(id)}/payments/status`, { credentials: "same-origin", cache: "no-store", signal });
        const payload = await response.json() as { success?: boolean; data?: { orderStatus?: string; paymentStatus?: string }; error?: { message?: string } };
        if (signal.aborted) return "unknown";
        if (!response.ok || !payload.success || !payload.data) {
          setMessage(payload.error?.message ?? "Payment status could not be checked automatically. You can try again below.");
          return "unknown";
        }
        const status = classifyCustomerPaymentStatus(payload.data.orderStatus, payload.data.paymentStatus);
        if (status === "paid") {
          setMessage("Payment verified. Your order history is updating.");
          router.refresh();
          return "paid";
        }
        if (payload.data.paymentStatus === "failed") {
          if (status !== "failed") {
            setMessage("A payment attempt failed. We are confirming when a new checkout is safe.");
            if (!refreshedFailedIds.current.has(id)) { refreshedFailedIds.current.add(id); router.refresh(); }
            return "pending";
          }
          setMessage("Payment expired. You can start a new checkout.");
          router.refresh();
          return "failed";
        }
        return "pending";
      } catch {
        if (!signal.aborted) setMessage("Payment status could not be checked automatically. You can try again below.");
        return "unknown";
      } finally { inFlightIds.current.delete(id); }
    });
  }, [pendingOrderIds, router]);

  async function setArchived(id: string, archived: boolean) {
    if (busyId) return;
    setBusyId(id);
    setMessage("");
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(id)}/archive`, { method: "PATCH", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ archived }) });
      const payload = await response.json() as { success?: boolean; error?: { message?: string } };
      if (!response.ok || !payload.success) throw new Error(payload.error?.message ?? "Could not update this order. Try again.");
      setMessage(archived ? "Order archived. You can restore it from the Archived tab." : "Order restored to your history.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update this order. Try again.");
    } finally { setBusyId(null); }
  }

  async function checkPaymentStatus(id: string) {
    if (busyId || inFlightIds.current.has(id)) return;
    inFlightIds.current.add(id);
    setBusyId(id);
    setMessage("");
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(id)}/payments/status`, { credentials: "same-origin", cache: "no-store" });
      const payload = await response.json() as { success?: boolean; data?: { paymentStatus?: string }; error?: { message?: string } };
      if (!response.ok || !payload.success) throw new Error(payload.error?.message ?? "Payment status could not be checked. Try again.");
      setMessage(payload.data?.paymentStatus === "paid" ? "Payment verified. Your order history is updating." : "Payment status checked with Cashfree. Review the updated order status.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Payment status could not be checked. Try again.");
    } finally { inFlightIds.current.delete(id); setBusyId(null); }
  }

  return <section className="mt-9" aria-labelledby="orders-heading">
    <div className="flex flex-wrap items-end justify-between gap-3"><h2 id="orders-heading" className="text-xl font-semibold text-foreground">Your orders</h2><p className="text-sm text-foreground-secondary">{total} {total === 1 ? "order" : "orders"} in this view</p></div>
    <nav aria-label="Order status filters" className="mt-5 flex flex-wrap gap-2">{tabs.map(({ key, label }) => <Link key={key} href={pageHref(key, 1)} aria-current={tab === key ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-full border px-4 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${tab === key ? "border-accent bg-accent text-[#0f1e36]" : "border-border text-foreground hover:bg-surface-secondary"}`}>{label}</Link>)}</nav>
    {message && <p role="status" aria-live="polite" className="mt-4 rounded-xl border border-border p-3 text-sm text-foreground-secondary">{message}</p>}
    {orders.length === 0 ? <div className="mt-6 rounded-2xl border border-dashed border-border p-8 text-sm text-foreground-secondary">No orders in this view. <Link href="/products" className="font-semibold underline">Explore Products</Link> or choose another filter.</div> : <ul className="mt-6 grid gap-4">{orders.map((order) => <li key={order.id} className="min-w-0 rounded-2xl border border-border bg-surface p-5 transition-colors hover:border-accent sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="break-all font-semibold text-foreground">{order.orderReference}</h3><p className="mt-1 text-xs text-foreground-secondary">{order.createdAt ? new Date(order.createdAt).toLocaleDateString("en-IN") : "Date unavailable"}</p></div><span className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-foreground" aria-label={`Order status: ${orderStatusLabel(order)}`}>{orderStatusLabel(order)}</span></div>
      <p className="mt-4 text-sm text-foreground-secondary">{order.lines.map((line) => line.productName).join(", ")}</p>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4"><span className="font-semibold text-foreground">{formatINR(order.totalPaise)}</span><div className="flex flex-wrap items-center gap-4"><Link href={`/checkout/${order.id}`} className="text-sm font-semibold text-accent-foreground underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-accent">View Details</Link>{["pending", "failed"].includes(order.paymentStatus) && <button type="button" disabled={busyId !== null} onClick={() => order.id && void checkPaymentStatus(order.id)} className="min-h-10 text-sm font-semibold text-accent-foreground underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50">{busyId === order.id ? "Checking..." : "Check payment status"}</button>}<button type="button" disabled={busyId !== null} onClick={() => order.id && void setArchived(order.id, !order.archivedAt)} className="min-h-10 text-sm font-semibold text-foreground underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50">{busyId === order.id ? "Updating..." : order.archivedAt ? "Unarchive" : "Archive"}</button></div></div>
      {order.id && order.orderStatus === "expired" && order.paymentStatus === "failed" && <div className="mt-4"><RetryExpiredOrder orderId={order.id} /></div>}
    </li>)}</ul>}
    {pageCount > 1 && <nav aria-label="Order pages" className="mt-6 flex items-center justify-between gap-3"><span className="text-sm text-foreground-secondary">Page {page} of {pageCount}</span><div className="flex gap-2">{page > 1 && <Link href={pageHref(tab, page - 1)} className="inline-flex min-h-11 items-center rounded-full border border-border px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-accent">Previous</Link>}{page < pageCount && <Link href={pageHref(tab, page + 1)} className="inline-flex min-h-11 items-center rounded-full border border-border px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-accent">Next</Link>}</div></nav>}
    <p className="mt-6 text-xs leading-5 text-foreground-secondary">These authenticated order summaries are not GST tax invoices or separately issued commercial receipts. Billing documentation is under review.</p>
  </section>;
}
