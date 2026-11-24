"use client";
import { useState } from "react";
export function ReviewForm({ productId }: { productId: string }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/reviews", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productId, rating: Number(form.get("rating")), text: form.get("text") }) });
      const result = await response.json();
      setMessage(response.ok ? "Thank you. Your review is awaiting moderation." : result.error);
    } catch { setMessage("Please try again."); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="mt-8 grid max-w-xl gap-4">
    <h3 className="text-lg font-semibold">Write a review</h3>
    <p className="text-sm text-foreground-secondary">Only verified purchasers can submit. Reviews are moderated before publication.</p>
    <label className="grid gap-2">Rating <select name="rating" required className="rounded-lg border border-border bg-background p-3">{[5,4,3,2,1].map((n) => <option key={n} value={n}>{n} stars</option>)}</select></label>
    <label className="grid gap-2">Your review <textarea name="text" minLength={10} maxLength={2000} required rows={5} className="rounded-lg border border-border bg-background p-3" /></label>
    <button disabled={busy} className="min-h-11 rounded-full bg-accent px-5 font-semibold text-[#0f1e36] focus-visible:outline-2 focus-visible:outline-accent">{busy ? "Submitting..." : "Submit review"}</button>
    <p role="status" aria-live="polite">{message}</p>
  </form>;
}
