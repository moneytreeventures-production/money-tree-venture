"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

type Item = { id: string; reference: string; name: string; email: string; category: string; subject: string; status: string; createdAt?: string };
type Detail = Item & { message: string; internalNotes: { text: string; createdAt: string }[]; history: { status: string; createdAt: string }[] };
const statusLabel = (status: string) => status.replaceAll("_", " ");
const fieldClass = "mt-field min-h-11 rounded-xl bg-background px-3 text-sm text-foreground";

export function SupportInbox() {
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ page: String(page) });
      if (status) query.set("status", status);
      if (category) query.set("category", category);
      if (submittedSearch) query.set("search", submittedSearch);
      const response = await fetch(`/api/admin/support?${query}`, { cache: "no-store" });
      if (!response.ok) throw new Error();
      const data = await response.json() as { items?: Item[]; total?: number };
      if (!Array.isArray(data.items) || typeof data.total !== "number") throw new Error();
      setItems(data.items);
      setTotal(data.total);
    } catch { setItems([]); setError("Unable to load requests. Retry to see the current inbox."); }
    finally { setLoading(false); }
  }, [status, category, page, submittedSearch]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  async function open(id: string) {
    setDetailLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/support/${encodeURIComponent(id)}`, { cache: "no-store" });
      if (!response.ok) throw new Error();
      setDetail(await response.json() as Detail);
    } catch { setError("Unable to open this request. Please retry."); }
    finally { setDetailLoading(false); }
  }

  async function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail || busy) return;
    const data = new FormData(event.currentTarget);
    const body = { status: data.get("status"), note: String(data.get("note") || "").trim() || undefined };
    setBusy(true);
    setFeedback("");
    try {
      const response = await fetch(`/api/admin/support/${encodeURIComponent(detail.id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!response.ok) throw new Error();
      setFeedback("Request update accepted.");
      await open(detail.id);
      await load();
    } catch { setError("Update failed. The request was not confirmed as saved."); }
    finally { setBusy(false); }
  }

  return <main className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
    <header><p className="text-xs font-bold uppercase tracking-[0.16em] text-accent-foreground">Customer operations</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Support inbox</h1><p className="mt-3 max-w-2xl text-sm leading-7 text-foreground-secondary">Track customer inquiries and private staff notes.</p></header>
    <div className="mt-8 grid gap-4 rounded-2xl border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-3">
      <label className="grid gap-2 text-sm font-semibold text-foreground">Status<select value={status} onChange={(event) => { setPage(1); setStatus(event.target.value); }} className={fieldClass}><option value="">All statuses</option>{["new", "in_progress", "resolved", "closed"].map((value) => <option key={value} value={value}>{statusLabel(value)}</option>)}</select></label>
      <label className="grid gap-2 text-sm font-semibold text-foreground">Category<select value={category} onChange={(event) => { setPage(1); setCategory(event.target.value); }} className={fieldClass}><option value="">All categories</option>{["general", "product", "order", "download", "booking", "grievance", "other"].map((value) => <option key={value} value={value}>{statusLabel(value)}</option>)}</select></label>
      <form onSubmit={(event) => { event.preventDefault(); setPage(1); setSubmittedSearch(search); }} className="flex items-end gap-2 sm:col-span-2 lg:col-span-1"><label className="grid min-w-0 flex-1 gap-2 text-sm font-semibold text-foreground">Reference or email<input value={search} onChange={(event) => setSearch(event.target.value)} className={fieldClass} /></label><button type="submit" className="mt-button rounded-full border border-border px-4 text-sm font-semibold text-foreground">Search</button></form>
    </div>
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm text-foreground-secondary"><p aria-live="polite">{total} requests · Page {page}</p><button type="button" onClick={() => void load()} disabled={loading} className="mt-button rounded-full border border-border px-4 text-sm font-semibold disabled:opacity-50">Refresh inbox</button></div>
    {feedback && <p role="status" className="mt-4 rounded-xl border border-emerald-700/20 bg-emerald-500/10 px-4 py-3 text-sm">{feedback}</p>}
    {error && <p role="alert" className="mt-4 rounded-xl border border-red-700/20 bg-red-500/10 px-4 py-3 text-sm">{error}</p>}
    <section aria-label="Support requests" className="mt-4 grid gap-3">
      {loading ? <p role="status" className="rounded-2xl border border-border bg-surface p-6 text-sm text-foreground-secondary">Loading requests...</p> : !error && items.length === 0 ? <p className="rounded-2xl border border-border bg-surface p-6 text-sm text-foreground-secondary">No requests match these filters.</p> : items.map((item) => <button key={item.id} type="button" onClick={() => void open(item.id)} className="min-h-16 min-w-0 rounded-2xl border border-border bg-surface p-4 text-left transition-colors hover:bg-surface-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:p-5">
        <span className="flex flex-wrap items-start justify-between gap-2"><strong className="break-words text-sm text-foreground">{item.reference} · {item.subject}</strong><span className="rounded-full border border-border px-3 py-1 text-xs font-semibold capitalize text-foreground-secondary">{statusLabel(item.status)}</span></span>
        <span className="mt-2 block text-xs capitalize text-foreground-secondary">{statusLabel(item.category)}{item.createdAt ? ` · ${new Date(item.createdAt).toLocaleDateString("en-IN")}` : ""}</span>
      </button>)}
    </section>
    <nav aria-label="Support pagination" className="mt-5 flex items-center justify-between gap-3"><button type="button" disabled={page === 1 || loading} onClick={() => setPage((current) => current - 1)} className="mt-button rounded-full border border-border px-4 text-sm disabled:opacity-50">Previous</button><span className="text-sm text-foreground-secondary">Page {page} of {Math.max(1, Math.ceil(total / 20))}</span><button type="button" disabled={page * 20 >= total || loading} onClick={() => setPage((current) => current + 1)} className="mt-button rounded-full border border-border px-4 text-sm disabled:opacity-50">Next</button></nav>
    {detailLoading && <p role="status" className="mt-6 text-sm text-foreground-secondary">Loading request details...</p>}
    {detail && <section className="mt-8 min-w-0 rounded-2xl border border-border bg-surface p-5 sm:p-7" aria-labelledby="support-detail-title"><div className="flex flex-wrap items-start justify-between gap-3"><h2 id="support-detail-title" className="break-words text-xl font-semibold text-foreground">{detail.reference} · {detail.subject}</h2><button type="button" onClick={() => setDetail(null)} className="mt-button rounded-full border border-border px-4 text-sm font-semibold">Close details</button></div><p className="mt-2 break-all text-sm text-foreground-secondary">{detail.name} · {detail.email}</p><p className="mt-5 whitespace-pre-wrap break-words rounded-xl bg-background p-4 text-sm leading-7 text-foreground">{detail.message}</p>
      <div className="mt-6 grid gap-6 sm:grid-cols-2"><div><h3 className="font-semibold text-foreground">Status history</h3>{detail.history.length ? detail.history.map((entry, index) => <p key={index} className="mt-2 text-sm text-foreground-secondary">{statusLabel(entry.status)} · {new Date(entry.createdAt).toLocaleString("en-IN")}</p>) : <p className="mt-2 text-sm text-foreground-secondary">No status history.</p>}</div><div><h3 className="font-semibold text-foreground">Private notes</h3>{detail.internalNotes.length ? detail.internalNotes.map((entry, index) => <p key={index} className="mt-2 whitespace-pre-wrap break-words text-sm text-foreground-secondary">{entry.text} · {new Date(entry.createdAt).toLocaleString("en-IN")}</p>) : <p className="mt-2 text-sm text-foreground-secondary">No private notes.</p>}</div></div>
      <form onSubmit={(event) => void update(event)} className="mt-7 grid gap-4 border-t border-border pt-5"><label className="grid gap-2 text-sm font-semibold">Status<select name="status" defaultValue={detail.status} className={fieldClass}>{["new", "in_progress", "resolved", "closed"].map((value) => <option key={value} value={value}>{statusLabel(value)}</option>)}</select></label><label className="grid gap-2 text-sm font-semibold">Internal note<textarea name="note" maxLength={2000} rows={3} className="mt-field rounded-xl bg-background p-3" /></label><button disabled={busy} className="mt-button w-fit rounded-full bg-primary px-5 text-sm font-semibold text-background disabled:opacity-50">{busy ? "Saving..." : "Save update"}</button></form>
    </section>}
  </main>;
}
