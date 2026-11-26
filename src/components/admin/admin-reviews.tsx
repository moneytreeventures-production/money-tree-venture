"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RatingStars } from "@/components/reviews/rating-stars";
import { AccessibleOverlay } from "@/components/ui/accessible-overlay";

type ReviewStatus = "pending" | "approved" | "rejected";
type Review = { id: string; rating: number; text: string; status: ReviewStatus; displayName: string; designation?: string; productId: string; productName: string; verifiedPurchase: boolean; createdAt?: string };

export function AdminReviews() {
  const [status, setStatus] = useState<ReviewStatus>("pending");
  const [items, setItems] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [action, setAction] = useState<{ id: string; next: "approved" | "rejected" } | null>(null);
  const [busy, setBusy] = useState(false);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/reviews?status=${status}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Reviews could not be loaded.");
      const result = await response.json() as { items?: Review[] };
      if (!Array.isArray(result.items)) throw new Error("Reviews could not be loaded.");
      if (currentRequest === requestId.current) setItems(result.items);
    } catch { if (currentRequest === requestId.current) { setItems([]); setError("Reviews could not be loaded. Retry to see the latest moderation queue."); } }
    finally { if (currentRequest === requestId.current) setLoading(false); }
  }, [status]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  async function confirmAction() {
    if (!action || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/reviews/${encodeURIComponent(action.id)}`, {
        method: "PATCH", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: action.next }),
      });
      if (!response.ok) throw new Error("Review update failed. Please retry.");
      setItems((current) => current.filter((item) => item.id !== action.id));
      setMessage(action.next === "approved" ? "Review approved and removed from this queue." : "Review rejected and removed from this queue.");
      setAction(null);
    } catch { setAction(null); setError("Review update failed. Please retry."); }
    finally { setBusy(false); }
  }

  return <main className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
    <header><p className="text-xs font-bold uppercase tracking-[0.16em] text-accent-foreground">Catalogue moderation</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Reviews</h1><p className="mt-3 max-w-2xl text-sm leading-7 text-foreground-secondary">Review customer feedback before it appears in the public catalogue.</p></header>
    <div className="mt-8 flex flex-wrap items-end justify-between gap-3 rounded-2xl border border-border bg-surface p-4">
      <label className="grid gap-2 text-sm font-semibold text-foreground">Moderation status
        <select value={status} onChange={(event) => { requestId.current += 1; setItems([]); setLoading(true); setStatus(event.target.value as ReviewStatus); setMessage(""); }} className="mt-field min-h-11 min-w-44 rounded-xl bg-background px-3"><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select>
      </label>
      <button type="button" onClick={() => void load()} disabled={loading} className="mt-button rounded-full border border-border px-5 text-sm font-semibold text-foreground disabled:opacity-50">Refresh reviews</button>
    </div>
    {message && <p className="mt-4 rounded-xl border border-emerald-700/20 bg-emerald-500/10 px-4 py-3 text-sm text-foreground" role="status">{message}</p>}
    {error && <p className="mt-4 rounded-xl border border-red-700/20 bg-red-500/10 px-4 py-3 text-sm text-foreground" role="alert">{error}</p>}
    <section aria-label={`${status} reviews`} className="mt-6 grid gap-4">
      {loading ? <p role="status" className="rounded-2xl border border-border bg-surface p-6 text-sm text-foreground-secondary">Loading reviews...</p> : !error && items.length === 0 ? <p className="rounded-2xl border border-border bg-surface p-6 text-sm text-foreground-secondary">No {status} reviews at the moment.</p> : items.map((item) => <article key={item.id} className="min-w-0 rounded-2xl border border-border bg-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h2 className="break-words text-base font-semibold text-foreground">{item.displayName}</h2>{item.designation && <p className="mt-1 text-sm text-foreground-secondary">{item.designation}</p>}<p className="mt-2 break-words text-sm text-foreground-secondary">Review of {item.productName}</p>{item.createdAt && <time dateTime={item.createdAt} className="mt-1 block text-xs text-foreground-secondary">{new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date(item.createdAt))}</time>}</div><span className="rounded-full border border-border px-3 py-1 text-xs font-semibold capitalize text-foreground-secondary">{item.status}</span></div>
        <div className="mt-4 flex flex-wrap items-center gap-3"><RatingStars rating={item.rating} /><span className="text-xs font-medium text-foreground-secondary">{item.verifiedPurchase ? "Verified purchase" : "Purchase verification unavailable"}</span></div>
        <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-7 text-foreground">{item.text}</p>
        {item.status !== "rejected" && <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">{item.status === "pending" && <button type="button" onClick={() => setAction({ id: item.id, next: "approved" })} className="mt-button rounded-full bg-primary px-5 text-sm font-semibold text-background">Approve</button>}<button type="button" onClick={() => setAction({ id: item.id, next: "rejected" })} className="mt-button rounded-full border border-border px-5 text-sm font-semibold text-foreground">Reject</button></div>}
      </article>)}
    </section>
    <AccessibleOverlay open={action !== null} onClose={() => { if (!busy) setAction(null); }} titleId="review-confirm-title" descriptionId="review-confirm-description" className="max-w-lg">
      <h2 id="review-confirm-title" className="text-xl font-semibold text-foreground">{action?.next === "approved" ? "Approve review?" : "Reject review?"}</h2>
      <p id="review-confirm-description" className="mt-3 text-sm leading-6 text-foreground-secondary">{action?.next === "approved" ? "This review can become visible publicly after approval." : "This review will remain out of public view."}</p>
      <div className="mt-6 flex flex-wrap justify-end gap-3"><button type="button" disabled={busy} onClick={() => setAction(null)} className="mt-button rounded-full border border-border px-5 text-sm font-semibold">Cancel</button><button type="button" disabled={busy} onClick={() => void confirmAction()} className="mt-button rounded-full bg-primary px-5 text-sm font-semibold text-background disabled:opacity-50">{busy ? "Saving..." : action?.next === "approved" ? "Approve review" : "Reject review"}</button></div>
    </AccessibleOverlay>
  </main>;
}
