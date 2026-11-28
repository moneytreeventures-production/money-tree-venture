"use client";

import { useState, type FormEvent } from "react";

type BookingState = "awaiting_scheduling" | "scheduled" | "confirmed" | "completed" | "cancelled";
interface AdminBooking {
  id: string; bookingReference: string; orderReference?: string; customer?: { name: string; email: string };
  status: BookingState; requestedSlots: Array<{ startsAt: Date | string; endsAt: Date | string; timezone: string }>;
  timezone?: string; scheduledStartAt?: Date | string; sessionDurationMinutes: number;
  schedulingInstructions: string; customerNotes?: string; adminNotes?: string;
}

const statusLabels: Record<BookingState, string> = {
  awaiting_scheduling: "Awaiting scheduling", scheduled: "Scheduled", confirmed: "Confirmed", completed: "Completed", cancelled: "Cancelled",
};

export function AdminBookings({ bookings }: { bookings: AdminBooking[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");

  async function updateBooking(event: FormEvent<HTMLFormElement>, booking: AdminBooking) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const status = String(form.get("status")) as BookingState;
    const payload: Record<string, string> = { status, adminNotes: String(form.get("adminNotes") ?? "") };
    if (status === "scheduled") {
      const localStart = String(form.get("scheduledStartAt") ?? "");
      if (!localStart) { setFeedback("Choose a call date and time."); return; }
      payload.scheduledStartAt = new Date(localStart).toISOString();
      payload.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    }
    if (status === "cancelled") payload.cancellationReason = String(form.get("cancellationReason") ?? "");
    setBusy(booking.id);
    setFeedback("");
    try {
      const response = await fetch(`/api/admin/bookings/${encodeURIComponent(booking.id)}`, {
        method: "PATCH", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
      });
      const result = await response.json() as { success?: boolean; error?: { message?: string } };
      if (!response.ok || !result.success) throw new Error(result.error?.message ?? "Booking update could not be saved.");
      window.location.reload();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Booking update could not be saved.");
      setBusy(null);
    }
  }

  if (!bookings.length) return <p className="mt-8 rounded-2xl border border-border bg-surface p-6 text-sm text-foreground-secondary">There are no bookings yet.</p>;
  return <section className="mt-9 space-y-5" aria-label="Call bookings">
    {feedback && <p className="rounded-lg border border-border px-4 py-3 text-sm text-foreground-secondary" role="alert">{feedback}</p>}
    {bookings.map((booking) => {
      const actions: BookingState[] = booking.status === "awaiting_scheduling" ? ["scheduled", "cancelled"] : booking.status === "scheduled" ? ["scheduled", "confirmed", "cancelled"] : booking.status === "confirmed" ? ["completed", "cancelled"] : [];
      return <article key={booking.id} className="min-w-0 rounded-2xl border border-border bg-surface p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><h2 className="break-words text-lg font-semibold text-foreground">{booking.customer?.name ?? "Customer"}</h2><p className="mt-1 break-all text-sm text-foreground-secondary">{booking.customer?.email ?? ""} · {booking.bookingReference}</p><p className="mt-1 break-all text-xs text-foreground-secondary">Order {booking.orderReference ?? "—"} · {booking.sessionDurationMinutes} minute call</p></div><span className={`rounded-full border px-3 py-1 text-xs font-semibold ${booking.status === "awaiting_scheduling" ? "border-amber-700/30 bg-amber-500/10 text-foreground" : "border-border text-foreground-secondary"}`}>{statusLabels[booking.status]}</span></div>
        {booking.requestedSlots.length > 0 && <div className="mt-5"><h3 className="text-sm font-semibold text-foreground">Customer preferred times</h3><ul className="mt-2 flex flex-wrap gap-2">{booking.requestedSlots.map((slot) => <li key={new Date(slot.startsAt).toISOString()} className="rounded-lg bg-background px-3 py-2 text-xs text-foreground-secondary">{new Date(slot.startsAt).toLocaleString("en-IN", { timeZone: slot.timezone })} · {slot.timezone}</li>)}</ul></div>}
        {booking.customerNotes && <p className="mt-4 text-sm leading-6 text-foreground-secondary"><strong className="text-foreground">Customer note:</strong> {booking.customerNotes}</p>}
        {booking.schedulingInstructions && <p className="mt-3 text-sm leading-6 text-foreground-secondary">{booking.schedulingInstructions}</p>}
        {actions.length > 0 && <form onSubmit={(event) => void updateBooking(event, booking)} className="mt-6 grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-medium text-foreground">Action<select name="status" defaultValue={booking.status === "awaiting_scheduling" ? "scheduled" : booking.status === "scheduled" ? "confirmed" : "completed"} className="min-h-11 rounded-lg border border-border bg-background px-3">{actions.map((action) => <option key={action} value={action}>{statusLabels[action]}</option>)}</select></label>
          <label className="grid gap-2 text-sm font-medium text-foreground">Call start time (when scheduling)<input name="scheduledStartAt" type="datetime-local" className="min-h-11 rounded-lg border border-border bg-background px-3" /></label>
          <label className="grid gap-2 text-sm font-medium text-foreground">Cancellation reason (when cancelling)<input name="cancellationReason" maxLength={500} className="min-h-11 rounded-lg border border-border bg-background px-3" /></label>
          <label className="grid gap-2 text-sm font-medium text-foreground sm:col-span-2">Internal admin note (optional)<textarea name="adminNotes" defaultValue={booking.adminNotes ?? ""} maxLength={4000} rows={2} className="rounded-lg border border-border bg-background px-3 py-2" /></label>
          <div><button type="submit" disabled={busy === booking.id} className="min-h-11 rounded-full bg-primary px-5 text-sm font-semibold text-background transition-colors hover:bg-primary-hover disabled:opacity-50">{busy === booking.id ? "Saving..." : "Update booking"}</button></div>
        </form>}
      </article>;
    })}
  </section>;
}
