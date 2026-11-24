"use client";
import { useCallback, useEffect, useState } from "react";
type Item = { id: string; reference: string; name: string; email: string; category: string; subject: string; status: string; createdAt?: string };
type Detail = Item & { message: string; internalNotes: { text: string; createdAt: string }[]; history: { status: string; createdAt: string }[] };
export function SupportInbox() {
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [submittedSearch, setSubmittedSearch] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [feedback, setFeedback] = useState("");
  const load = useCallback(async () => {
    const query = new URLSearchParams({ page: String(page) });
    if (status) query.set("status", status);
    if (category) query.set("category", category);
    if (submittedSearch) query.set("search", submittedSearch);
    const response = await fetch("/api/admin/support?" + query, { cache: "no-store" });
    if (!response.ok) { setFeedback("Unable to load requests."); return; }
    const data = await response.json();
    setItems(data.items); setTotal(data.total);
  }, [status, category, page, submittedSearch]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  async function open(id: string) {
    const response = await fetch("/api/admin/support/" + id, { cache: "no-store" });
    if (response.ok) setDetail(await response.json());
    else setFeedback("Unable to open request.");
  }
  async function update(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail) return;
    const data = new FormData(event.currentTarget);
    const body = { status: data.get("status"), note: String(data.get("note") || "").trim() || undefined };
    const response = await fetch("/api/admin/support/" + detail.id, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    setFeedback(response.ok ? "Request updated." : "Update failed.");
    if (response.ok) { await open(detail.id); await load(); }
  }
  return <main className="mx-auto max-w-6xl px-5 py-12"><h1 className="text-3xl font-semibold">Support inbox</h1>
    <div className="mt-6 flex flex-wrap gap-3">
      <label>Status <select value={status} onChange={(event) => { setPage(1); setStatus(event.target.value); }} className="ml-2 rounded border border-border bg-background p-2"><option value="">All</option>{["new","in_progress","resolved","closed"].map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>Category <select value={category} onChange={(event) => { setPage(1); setCategory(event.target.value); }} className="ml-2 rounded border border-border bg-background p-2"><option value="">All</option>{["general","product","order","download","booking","grievance","other"].map((value) => <option key={value}>{value}</option>)}</select></label>
      <form onSubmit={(event) => { event.preventDefault(); setPage(1); setSubmittedSearch(search); }}><label>Reference or email <input value={search} onChange={(event) => setSearch(event.target.value)} className="ml-2 rounded border border-border bg-background p-2" /></label><button className="ml-2 rounded border border-border px-3 py-2">Search</button></form>
    </div>
    <p className="mt-4 text-sm text-foreground-secondary">{total} requests</p><p role="status">{feedback}</p>
    <div className="mt-5 grid gap-3">{items.map((item) => <button key={item.id} type="button" onClick={() => void open(item.id)} className="rounded-xl border border-border p-4 text-left hover:bg-surface-secondary focus-visible:outline-2 focus-visible:outline-accent"><strong>{item.reference}</strong>  -  {item.subject}  -  {item.category}  -  {item.status}  -  {item.createdAt ? new Date(item.createdAt).toLocaleDateString("en-IN") : ""}</button>)}</div>
    <div className="mt-5 flex gap-3"><button disabled={page === 1} onClick={() => setPage(page-1)} className="rounded border border-border px-4 py-2 disabled:opacity-50">Previous</button><span>Page {page}</span><button disabled={page*20 >= total} onClick={() => setPage(page+1)} className="rounded border border-border px-4 py-2 disabled:opacity-50">Next</button></div>
    {detail && <section className="mt-8 rounded-xl border border-border p-5"><h2 className="text-xl font-semibold">{detail.reference}  -  {detail.subject}</h2><p>{detail.name}  -  {detail.email}</p><p className="mt-4 whitespace-pre-wrap break-words">{detail.message}</p>
      <h3 className="mt-6 font-semibold">Status history</h3>{detail.history.map((entry, index) => <p key={index}>{entry.status}  -  {new Date(entry.createdAt).toLocaleString("en-IN")}</p>)}
      <h3 className="mt-6 font-semibold">Private notes</h3>{detail.internalNotes.map((entry, index) => <p key={index} className="whitespace-pre-wrap break-words">{entry.text}  -  {new Date(entry.createdAt).toLocaleString("en-IN")}</p>)}
      <form onSubmit={(event) => void update(event)} className="mt-5 grid gap-3"><label>Status <select name="status" defaultValue={detail.status} className="ml-2 rounded border border-border bg-background p-2">{["new","in_progress","resolved","closed"].map((value) => <option key={value}>{value}</option>)}</select></label><label className="grid gap-2">Internal note<textarea name="note" maxLength={2000} className="rounded border border-border bg-background p-3" /></label><button className="rounded bg-accent px-4 py-2 font-semibold text-[#0f1e36]">Save update</button></form>
    </section>}
  </main>;
}
