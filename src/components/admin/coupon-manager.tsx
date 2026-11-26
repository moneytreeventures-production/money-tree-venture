"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AccessibleOverlay } from "@/components/ui/accessible-overlay";

type Coupon = { _id: string; code: string; discountType: "fixed" | "percentage"; discountValue: number; minimumOrderPaise: number; validFrom: string; validUntil: string; status: string; uses: number };
const fieldClass = "mt-field mt-2 block min-h-11 w-full rounded-xl bg-background px-3 text-foreground";

export function CouponManager() {
  const [items, setItems] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [deactivating, setDeactivating] = useState<Coupon | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/coupons", { cache: "no-store" });
      if (!response.ok) throw new Error();
      const result = await response.json() as { items?: Coupon[] };
      if (!Array.isArray(result.items)) throw new Error();
      setItems(result.items);
    } catch { setItems([]); setError("Coupons could not be loaded. Retry to see current offers."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const startsAt = new Date(String(fields.get("from")));
    const expiresAt = new Date(String(fields.get("until")));
    if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(expiresAt.getTime()) || expiresAt <= startsAt) {
      setError("Choose valid dates with expiry after the start time.");
      return;
    }
    const body = { code: fields.get("code"), discountType: fields.get("type"), discountValue: Number(fields.get("value")), minimumOrderPaise: Number(fields.get("minimum") || 0), validFrom: startsAt.toISOString(), validUntil: expiresAt.toISOString(), status: "active" };
    setBusy(true); setMessage(""); setError("");
    try {
      const response = await fetch("/api/admin/coupons", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!response.ok) throw new Error();
      setMessage("Coupon created.");
      form.reset();
      await load();
    } catch { setError("Coupon could not be created. Check the entered values and retry."); }
    finally { setBusy(false); }
  }

  async function deactivate() {
    if (!deactivating || busy) return;
    setBusy(true); setMessage(""); setError("");
    try {
      const response = await fetch(`/api/admin/coupons/${encodeURIComponent(deactivating._id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error();
      setMessage(`${deactivating.code} deactivated.`);
      setDeactivating(null);
      await load();
    } catch { setDeactivating(null); setError("Coupon could not be deactivated. Please retry."); }
    finally { setBusy(false); }
  }

  return <main className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
    <header><p className="text-xs font-bold uppercase tracking-[0.16em] text-accent-foreground">Catalogue operations</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Coupons</h1><p className="mt-3 max-w-2xl text-sm leading-7 text-foreground-secondary">Create offers and review current coupon usage. Values are entered in basis points or paise as labelled.</p></header>
    <section className="mt-8 rounded-2xl border border-border bg-surface p-5 sm:p-7" aria-labelledby="create-coupon-title"><h2 id="create-coupon-title" className="text-lg font-semibold text-foreground">Create coupon</h2><form onSubmit={(event) => void submit(event)} className="mt-5 grid gap-4 sm:grid-cols-2">
      <label className="text-sm font-semibold">Code<input required name="code" minLength={3} maxLength={64} className={fieldClass} /></label>
      <label className="text-sm font-semibold">Discount type<select name="type" className={fieldClass}><option value="percentage">Percentage (basis points)</option><option value="fixed">Fixed (paise)</option></select></label>
      <label className="text-sm font-semibold">Value<input required name="value" type="number" min="1" className={fieldClass} /></label>
      <label className="text-sm font-semibold">Minimum order (paise)<input name="minimum" type="number" min="0" defaultValue="0" className={fieldClass} /></label>
      <label className="text-sm font-semibold">Starts<input required name="from" type="datetime-local" className={fieldClass} /></label>
      <label className="text-sm font-semibold">Expires<input required name="until" type="datetime-local" className={fieldClass} /></label>
      <button disabled={busy} className="mt-button w-fit rounded-full bg-primary px-5 text-sm font-semibold text-background disabled:opacity-50">{busy ? "Creating..." : "Create coupon"}</button>
    </form></section>
    {message && <p role="status" className="mt-4 rounded-xl border border-emerald-700/20 bg-emerald-500/10 px-4 py-3 text-sm">{message}</p>}
    {error && <p role="alert" className="mt-4 rounded-xl border border-red-700/20 bg-red-500/10 px-4 py-3 text-sm">{error}</p>}
    <section aria-labelledby="coupon-list-title" className="mt-9"><div className="flex flex-wrap items-center justify-between gap-3"><h2 id="coupon-list-title" className="text-xl font-semibold text-foreground">Existing coupons</h2><button type="button" disabled={loading} onClick={() => void load()} className="mt-button rounded-full border border-border px-4 text-sm font-semibold disabled:opacity-50">Refresh</button></div>
      <div className="mt-4 grid gap-3">{loading ? <p role="status" className="rounded-2xl border border-border bg-surface p-6 text-sm">Loading coupons...</p> : !error && items.length === 0 ? <p className="rounded-2xl border border-border bg-surface p-6 text-sm text-foreground-secondary">No coupons yet.</p> : items.map((coupon) => <article key={coupon._id} className="min-w-0 rounded-2xl border border-border bg-surface p-5"><div className="flex flex-wrap items-start justify-between gap-3"><h3 className="break-all font-semibold text-foreground">{coupon.code}</h3><span className="rounded-full border border-border px-3 py-1 text-xs font-semibold capitalize text-foreground-secondary">{coupon.status}</span></div><p className="mt-3 text-sm text-foreground-secondary">{coupon.discountType === "fixed" ? `${coupon.discountValue} paise` : `${coupon.discountValue} basis points`} · {coupon.uses} uses · Expires {new Date(coupon.validUntil).toLocaleDateString("en-IN")}</p>{coupon.status === "active" && <button type="button" onClick={() => setDeactivating(coupon)} className="mt-button mt-4 rounded-full border border-border px-4 text-sm font-semibold text-foreground">Deactivate</button>}</article>)}</div>
    </section>
    <AccessibleOverlay open={deactivating !== null} onClose={() => { if (!busy) setDeactivating(null); }} titleId="deactivate-coupon-title" descriptionId="deactivate-coupon-description" className="max-w-lg"><h2 id="deactivate-coupon-title" className="text-xl font-semibold">Deactivate coupon?</h2><p id="deactivate-coupon-description" className="mt-3 break-all text-sm leading-6 text-foreground-secondary">{deactivating?.code} will stop being available for new orders.</p><div className="mt-6 flex flex-wrap justify-end gap-3"><button type="button" disabled={busy} onClick={() => setDeactivating(null)} className="mt-button rounded-full border border-border px-5 text-sm font-semibold">Cancel</button><button type="button" disabled={busy} onClick={() => void deactivate()} className="mt-button rounded-full bg-primary px-5 text-sm font-semibold text-background disabled:opacity-50">{busy ? "Saving..." : "Deactivate coupon"}</button></div></AccessibleOverlay>
  </main>;
}
