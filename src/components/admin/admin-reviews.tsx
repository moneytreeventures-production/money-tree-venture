"use client";
import { useEffect, useState } from "react";
type Review = { id: string; rating: number; text: string; status: string; displayName: string; productId: string; productName: string; createdAt?: string };
export function AdminReviews() {
  const [status, setStatus] = useState<"pending"|"approved"|"rejected">("pending");
  const [items, setItems] = useState<Review[]>([]);
  const [message, setMessage] = useState("");
  useEffect(() => { void fetch("/api/admin/reviews?status=" + status).then((r) => r.json()).then((d) => setItems(d.items ?? [])); }, [status]);
  async function update(id: string, next: "approved"|"rejected") {
    if (!window.confirm(next === "rejected" ? "Remove this review from public view?" : "Approve this review?")) return;
    const r = await fetch("/api/admin/reviews/" + id, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: next }) });
    setMessage(r.ok ? "Review updated." : "Review update failed.");
    if (r.ok) setItems(items.filter((item) => item.id !== id));
  }
  return <main className="mx-auto max-w-5xl px-5 py-12"><h1 className="text-3xl font-semibold">Reviews</h1>
    <label className="mt-6 block">Status <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="ml-3 rounded border border-border bg-background p-2"><option>pending</option><option>approved</option><option>rejected</option></select></label>
    <p role="status">{message}</p><div className="mt-6 grid gap-4">{items.map((item) => <article key={item.id} className="rounded-xl border border-border p-5">
      <p>{item.rating} / 5 � {item.displayName} � {item.productName} ? {item.createdAt ? new Date(item.createdAt).toLocaleDateString("en-IN") : ""}</p><p className="mt-2 whitespace-pre-wrap break-words">{item.text}</p>
      {item.status === "pending" && <button onClick={() => void update(item.id,"approved")} className="mr-4 mt-4 rounded bg-accent px-4 py-2 text-[#0f1e36]">Approve</button>}
      {item.status !== "rejected" && <button onClick={() => void update(item.id,"rejected")} className="mt-4 rounded border border-border px-4 py-2">Reject</button>}
    </article>)}</div></main>;
}
