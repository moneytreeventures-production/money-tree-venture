"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { pdfDownloadButtonLabel } from "@/lib/fulfillment/download-presentation";

interface PurchaseItem {
  id: string; productId?: string; productSlug?: string; orderId?: string; orderReference?: string; productName: string; productType: string;
  entitlementType: string; grantedAt: Date | string; thumbnailRef?: string; purchaseCount?: number;
  files: Array<{ id: string; productName?: string; sourceAssetVersion: string; status: "pending" | "ready" | "failed" }>;
}
interface BookingItem {
  id: string; bookingReference: string; status: "awaiting_scheduling" | "scheduled" | "confirmed" | "completed" | "cancelled";
  requestedSlots: Array<{ startsAt: Date | string; timezone: string }>;
  scheduledStartAt?: Date | string; timezone?: string; schedulingInstructions: string; customerNotes?: string; createdAt?: Date | string;
}

export function AccountResources({ purchases, bookings, showLibrary = true, showBookings = true }: { purchases: PurchaseItem[]; bookings: BookingItem[]; showLibrary?: boolean; showBookings?: boolean }) {
  const router = useRouter();
  const [downloading, setDownloading] = useState<string | null>(null);
  const [savingBooking, setSavingBooking] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function download(purchaseId: string, fileId: string) {
    const key = `${purchaseId}:${fileId}`;
    setDownloading(key);
    setMessage("");
    try {
      const response = await fetch(`/api/purchases/${encodeURIComponent(purchaseId)}/files/${encodeURIComponent(fileId)}/download`, { method: "GET", credentials: "same-origin" });
      if (response.status === 401) { router.push("/login"); return; }
      if (!response.ok || response.headers.get("content-type")?.split(";")[0] !== "application/pdf") throw new Error("This resource is temporarily unavailable. Please contact support.");
      const blobUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `moneytree-resource-${fileId}.pdf`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
      setMessage("Your download is ready.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Try again");
    } finally {
      setDownloading(null);
    }
  }

  async function requestAvailability(event: FormEvent<HTMLFormElement>, booking: BookingItem) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const dateTime = String(form.get("requestedStartAt") ?? "");
    if (!dateTime) { setMessage("Choose your preferred call time"); return; }
    setSavingBooking(booking.id);
    setMessage("");
    try {
      const response = await fetch(`/api/bookings/${encodeURIComponent(booking.id)}/availability`, {
        method: "PATCH", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify({ timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, requestedStartsAt: [new Date(dateTime).toISOString()], customerNotes: String(form.get("customerNotes") ?? "") }),
      });
      const result = await response.json() as { success?: boolean; error?: { message?: string } };
      if (!response.ok || !result.success) throw new Error(result.error?.message ?? "Try again");
      setMessage("Your preferred time has been submitted. Your appointment is not confirmed until our team reviews it.");
      setSavingBooking(null);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Try again");
      setSavingBooking(null);
    }
  }

  return (
    <div className="mt-12 space-y-14">
      {showLibrary && <section id="library" aria-labelledby="purchases-heading">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
          <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground-secondary">Library</p><h2 id="purchases-heading" className="mt-2 text-2xl font-semibold tracking-tight text-foreground">Your PDF resources</h2></div>
          <span className="text-sm text-foreground-secondary">Showing {purchases.length} product{purchases.length === 1 ? "" : "s"}</span>
        </div>
        {message && <p role="alert" className="mt-4 rounded-lg border border-border px-4 py-3 text-sm text-foreground-secondary">{message}</p>}
        {purchases.length === 0 ? <p className="py-8 text-sm text-foreground-secondary">Your library is empty. <Link href="/products" className="font-semibold underline">Explore Products</Link> to get started.</p> : (
          <ul className="divide-y divide-border">
            {purchases.map((purchase) => (
              <li key={purchase.id} className="grid gap-4 py-6 sm:grid-cols-[1fr_auto] sm:items-start">
                <div className="flex min-w-0 gap-4">
                  <div className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-surface-secondary sm:size-24">{purchase.thumbnailRef && (/^\/(?!\/|\\)/.test(purchase.thumbnailRef) || purchase.thumbnailRef.startsWith("https://")) ? <Image src={purchase.thumbnailRef} alt={`${purchase.productName} thumbnail`} fill sizes="96px" unoptimized className="object-cover" /> : <span className="grid size-full place-items-center text-xl font-semibold text-foreground-secondary" aria-hidden="true">{purchase.productName.slice(0, 1)}</span>}</div>
                  <div className="min-w-0">
                  <h3 className="font-semibold text-foreground">{purchase.productName}</h3>
                  {purchase.productSlug && <Link href={`/products/${purchase.productSlug}`} className="mt-2 inline-block text-xs font-semibold underline">View Product</Link>}
                  {purchase.orderId && <Link href={`/checkout/${purchase.orderId}`} className="ml-4 mt-2 inline-block text-xs font-semibold underline">View Purchase</Link>}
                  {(purchase.purchaseCount ?? 0) > 1 && <Link href="/account/orders" className="mt-2 block text-xs font-semibold underline">Purchased {purchase.purchaseCount} times - view order history</Link>}
                  <p className="mt-1 text-xs text-foreground-secondary">Active access ? {purchase.productType === "pdf_bundle" ? "PDF bundle" : purchase.productType === "pdf" ? "PDF" : "Call Guidance"}</p>
                      <p className="mt-1 text-xs text-foreground-secondary">Order {purchase.orderReference ?? "—"} · {new Date(purchase.grantedAt).toLocaleDateString("en-IN")}</p>
                      {purchase.entitlementType === "booking" && <p className="mt-2 text-sm text-foreground-secondary">Booking instructions will appear here.</p>}
                  </div>
                </div>
                {purchase.files.length > 0 && <ul className="flex flex-wrap gap-2 sm:justify-end">{purchase.files.map((file) => (
                  <li key={file.id}>
                    <button type="button" disabled={downloading !== null} onClick={() => void download(purchase.id, file.id)} className="inline-flex min-h-11 items-center rounded-full border border-border px-4 text-sm font-medium text-foreground transition-colors hover:border-primary hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50">
                      {pdfDownloadButtonLabel(file.productName ?? "PDF", file.status, downloading === `${purchase.id}:${file.id}`)}
                    </button>
                  </li>
                ))}</ul>}
              </li>
            ))}
          </ul>
        )}
      </section>}

      {showBookings && <section aria-labelledby="bookings-heading">
        <div className="border-b border-border pb-4"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground-secondary">1:1 Call Guidance</p><h2 id="bookings-heading" className="mt-2 text-2xl font-semibold tracking-tight text-foreground">Your call bookings</h2></div>
        {bookings.length === 0 ? <p className="py-8 text-sm text-foreground-secondary">You do not have any Call Guidance bookings yet.</p> : (
          <ul className="divide-y divide-border">{bookings.map((booking) => (
            <li key={booking.id} className="py-6">
              <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold text-foreground">Booking status {booking.bookingReference}</h3><span className="rounded-full border border-border px-3 py-1 text-xs font-medium text-foreground-secondary">{booking.status === "awaiting_scheduling" && booking.requestedSlots.length ? "Your preferred times are being reviewed" : booking.status === "awaiting_scheduling" ? "Waiting for you to choose a time" : booking.status === "scheduled" ? "Appointment proposed by our team" : booking.status === "confirmed" ? "Call confirmed" : booking.status === "completed" ? "Call completed" : "Booking cancelled"}</span></div>
              {booking.scheduledStartAt && <p className="mt-2 text-sm text-foreground-secondary">{booking.status === "scheduled" ? "Proposed time" : "Call time"}: {new Date(booking.scheduledStartAt).toLocaleString("en-IN", { timeZone: booking.timezone })} ({booking.timezone})</p>}
              {booking.status === "awaiting_scheduling" && <p className="mt-3 text-sm leading-6 text-foreground-secondary">{booking.schedulingInstructions}</p>}
              {booking.requestedSlots.map((slot) => <p key={new Date(slot.startsAt).toISOString()} className="mt-2 text-xs text-foreground-secondary">Preferred time: {new Date(slot.startsAt).toLocaleString("en-IN", { timeZone: slot.timezone })} ({slot.timezone})</p>)}
              {booking.status === "awaiting_scheduling" && <form onSubmit={(event) => void requestAvailability(event, booking)} className="mt-4 grid max-w-2xl gap-3 sm:grid-cols-2">
                <label className="grid gap-2 text-sm font-medium text-foreground">Choose your preferred call time<input name="requestedStartAt" type="datetime-local" required className="min-h-11 rounded-lg border border-border bg-background px-3" /></label>
                <label className="grid gap-2 text-sm font-medium text-foreground">Time zone<input value={Intl.DateTimeFormat().resolvedOptions().timeZone} readOnly className="min-h-11 rounded-lg border border-border bg-background px-3 text-foreground-secondary" /></label>
                <label className="grid gap-2 text-sm font-medium text-foreground sm:col-span-2">Note (optional)<textarea name="customerNotes" defaultValue={booking.customerNotes ?? ""} maxLength={2000} rows={2} className="rounded-lg border border-border bg-background px-3 py-2" /></label>
                <div><button type="submit" disabled={savingBooking === booking.id} className="min-h-11 rounded-full border border-border px-4 text-sm font-semibold text-foreground hover:border-primary disabled:opacity-50">{savingBooking === booking.id ? "Sending your time…" : booking.requestedSlots.length ? "Send a new preferred time" : "Send preferred time"}</button></div>
              </form>}
            </li>
          ))}</ul>
        )}
      </section>}
    </div>
  );
}
