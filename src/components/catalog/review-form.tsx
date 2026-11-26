"use client";

import { useState } from "react";
import { Star } from "lucide-react";

export function ReviewForm({ productId }: { productId: string }) {
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (rating < 1 || rating > 5) {
      setMessage("Select a rating from one to five stars.");
      return;
    }
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productId, rating, text: form.get("text"), designation: String(form.get("designation") ?? "").trim() || undefined }),
      });
      const result: { status?: string; error?: string } = await response.json();
      setMessage(response.status === 201 && result.status === "pending"
        ? "Thank you. Your review is awaiting moderation."
        : result.error || "Your review could not be submitted. Please try again.");
    } catch {
      setMessage("Your review could not be submitted. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return <form onSubmit={submit} className="mt-10 grid max-w-xl gap-5 rounded-2xl border border-border bg-surface p-5 sm:p-7">
    <div>
      <h3 className="text-lg font-semibold">Write a review</h3>
      <p className="mt-2 text-sm text-foreground-secondary">Verified purchasers can share their experience. Reviews are moderated before publication.</p>
    </div>
    <fieldset disabled={busy} className="grid gap-2">
      <legend className="text-sm font-medium">Your rating</legend>
      <div className="mt-2 flex gap-1" onMouseLeave={() => setHovered(0)}>
        {[1, 2, 3, 4, 5].map((value) => <label key={value} onMouseEnter={() => setHovered(value)} className="relative grid size-11 cursor-pointer place-items-center rounded-lg focus-within:outline-2 focus-within:outline-accent">
          <input type="radio" name="rating" value={value} checked={rating === value} onChange={() => { setRating(value); setMessage(""); }} required className="absolute inset-0 cursor-pointer opacity-0" aria-label={`${value} ${value === 1 ? "star" : "stars"}`} />
          <Star size={26} fill={value <= (hovered || rating) ? "currentColor" : "none"} aria-hidden="true" className="pointer-events-none text-amber-600 dark:text-amber-400" />
        </label>)}
      </div>
    </fieldset>
    <label className="grid gap-2 text-sm font-medium">Your review
      <textarea name="text" minLength={10} maxLength={2000} required rows={5} disabled={busy} onChange={() => setMessage("")} className="rounded-lg border border-border bg-background p-3 font-normal focus-visible:outline-2 focus-visible:outline-accent" />
    </label>
    <label className="grid gap-2 text-sm font-medium">Designation / Occupation (optional)
      <input name="designation" type="text" maxLength={80} disabled={busy} placeholder="e.g. Student, Homemaker, Retired Teacher" autoComplete="organization-title" className="mt-field min-h-11 rounded-lg bg-background px-3 font-normal" />
    </label>
    <button type="submit" disabled={busy} className="min-h-11 rounded-full bg-accent px-5 font-semibold text-[#0f1e36] transition-colors hover:brightness-95 focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-wait disabled:opacity-60">{busy ? "Submitting review…" : "Submit review"}</button>
    <p role="status" aria-live="polite" className="text-sm text-foreground-secondary">{message}</p>
  </form>;
}
