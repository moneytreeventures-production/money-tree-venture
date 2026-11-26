"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

type Health = { pending: number; processing: number; retry: number; sent: number; suppressed: number; deadLetter: number; oldestPendingAt: string | null; configuration: { testingEnabled: boolean; resendConfigured: boolean; workerConfigured: boolean; recipientsConfigured: boolean; rateIndexReady: boolean } };

export function EmailTestingPanel() {
  const [recipient, setRecipient] = useState("");
  const [kind, setKind] = useState<"basic" | "purchase">("basic");
  const [health, setHealth] = useState<Health | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/admin/email-testing", { cache: "no-store" });
      if (!response.ok) throw new Error();
      setHealth(await response.json() as Health);
    } catch { setError("Email status is unavailable. Retry before sending a test."); setHealth(null); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void Promise.resolve().then(refresh); }, [refresh]);

  const configuration = health?.configuration;
  const canSend = Boolean(configuration?.testingEnabled && configuration.resendConfigured && configuration.recipientsConfigured && configuration.rateIndexReady);
  const missing = configuration ? [
    !configuration.testingEnabled && "Testing is disabled in this environment",
    !configuration.resendConfigured && "Resend is not configured",
    !configuration.recipientsConfigured && "Approved recipients are not configured",
    !configuration.rateIndexReady && "Rate-limit index is unavailable",
  ].filter(Boolean) : [];

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !canSend) return;
    setBusy(true); setStatus(""); setError("");
    try {
      const response = await fetch("/api/admin/email-testing", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ recipient, kind }) });
      const result = await response.json() as { reference?: string; providerMessageId?: string; error?: string | { message?: string } };
      if (!response.ok) { setError(typeof result.error === "string" ? result.error : result.error?.message ?? (response.status === 429 ? "Rate limit reached. Please try later." : "Test request failed.")); return; }
      setStatus(`Resend accepted the test. Reference: ${result.reference ?? "unavailable"}. Provider message ID: ${result.providerMessageId ?? "unavailable"}. Delivery has not been confirmed.`);
      await refresh();
    } catch { setError("Test request failed. Please check your connection."); }
    finally { setBusy(false); }
  }

  return <main className="mx-auto w-full max-w-6xl space-y-7 px-5 py-10 sm:px-8 sm:py-14">
    <header><p className="text-xs font-bold uppercase tracking-[0.16em] text-accent-foreground">Administrator tools</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Email testing</h1><p className="mt-3 max-w-2xl text-sm leading-7 text-foreground-secondary">Send one controlled test to an approved inbox. Provider acceptance does not confirm delivery.</p></header>
    {error && <p role="alert" className="rounded-xl border border-red-700/20 bg-red-500/10 px-4 py-3 text-sm text-foreground">{error}</p>}
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-2xl border border-border bg-surface p-5 sm:p-7"><h2 className="text-lg font-semibold text-foreground">Send test email</h2><p className="mt-2 text-sm leading-6 text-foreground-secondary">Synthetic confirmation uses test content only. It does not create an order or purchase.</p>
        <form onSubmit={(event) => void send(event)} className="mt-5 space-y-4"><label className="block text-sm font-semibold">Approved recipient email<input required type="email" autoComplete="email" value={recipient} onChange={(event) => setRecipient(event.target.value)} className="mt-field mt-2 min-h-11 w-full rounded-xl bg-background p-3 text-foreground" /></label>
          <label className="block text-sm font-semibold">Test type<select value={kind} onChange={(event) => setKind(event.target.value as "basic" | "purchase")} className="mt-field mt-2 min-h-11 w-full rounded-xl bg-background p-3 text-foreground"><option value="basic">Basic test</option><option value="purchase">Synthetic purchase confirmation</option></select></label>
          <button disabled={busy || loading || !canSend} className="mt-button rounded-full bg-primary px-5 text-sm font-semibold text-background disabled:opacity-50">{busy ? "Sending..." : "Send test email"}</button></form>
        {!loading && missing.length > 0 && <ul className="mt-4 list-inside list-disc text-sm text-foreground-secondary">{missing.map((item) => <li key={String(item)}>{item}</li>)}</ul>}
        <p role="status" aria-live="polite" className="mt-4 break-words text-sm leading-6 text-foreground-secondary">{status}</p>
      </section>
      <section className="rounded-2xl border border-border bg-surface p-5 sm:p-7"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold text-foreground">Outbox health</h2><button type="button" onClick={() => void refresh()} disabled={loading} className="mt-button rounded-full border border-border px-4 text-sm font-semibold disabled:opacity-50">Refresh status</button></div>
        {loading && <p role="status" className="mt-5 text-sm text-foreground-secondary">Loading email status...</p>}
        {health && <><dl className="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">{[["Pending", health.pending], ["Processing", health.processing], ["Retry", health.retry], ["Accepted by Resend", health.sent], ["Suppressed", health.suppressed], ["Dead letter", health.deadLetter]].map(([label, value]) => <div key={label} className="rounded-xl bg-background p-3"><dt className="text-xs text-foreground-secondary">{label}</dt><dd className="mt-1 text-xl font-semibold text-foreground">{value}</dd></div>)}</dl><p className="mt-4 text-sm text-foreground-secondary">Oldest pending: {health.oldestPendingAt ? new Date(health.oldestPendingAt).toLocaleString("en-IN") : "None"}</p><div className="mt-4 flex flex-wrap gap-2 text-xs">{[["Testing", configuration?.testingEnabled], ["Resend", configuration?.resendConfigured], ["Approved recipients", configuration?.recipientsConfigured], ["Rate limit", configuration?.rateIndexReady], ["Worker", configuration?.workerConfigured]].map(([label, ready]) => <span key={String(label)} className={`rounded-full border px-3 py-1 font-semibold ${ready ? "border-emerald-700/30 bg-emerald-500/10" : "border-amber-700/30 bg-amber-500/10"}`}>{label}: {ready ? "ready" : "not ready"}</span>)}</div></>}
      </section>
    </div>
  </main>;
}
