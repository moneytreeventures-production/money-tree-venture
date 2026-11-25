"use client";

import { useCallback, useEffect, useState } from "react";

type Health = { pending: number; processing: number; retry: number; sent: number; suppressed: number; deadLetter: number; oldestPendingAt: string | null; configuration: { testingEnabled: boolean; resendConfigured: boolean; workerConfigured: boolean; recipientsConfigured: boolean; rateIndexReady: boolean } };

export function EmailTestingPanel() {
  const [recipient, setRecipient] = useState("");
  const [kind, setKind] = useState<"basic" | "purchase">("basic");
  const [health, setHealth] = useState<Health | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    const response = await fetch("/api/admin/email-testing", { cache: "no-store" });
    if (response.ok) setHealth(await response.json());
    else { const result = await response.json().catch(() => ({})); setStatus(result.error ?? "Email status is unavailable."); }
  }, []);
  useEffect(() => { void Promise.resolve().then(refresh); }, [refresh]);
  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setStatus("");
    try {
      const response = await fetch("/api/admin/email-testing", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ recipient, kind }) });
      const result = await response.json();
      setStatus(response.ok ? `Resend accepted the test. Reference: ${result.reference}. Provider message ID: ${result.providerMessageId}. Delivery has not been confirmed.` : result.error ?? "Test request failed.");
      await refresh();
    } catch { setStatus("Test request failed. Please check your connection."); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 sm:px-8">
    <header><p className="text-xs font-semibold uppercase tracking-widest text-accent-foreground">Admin tools</p><h1 className="mt-2 text-3xl font-semibold">Email testing</h1><p className="mt-2 text-sm text-foreground-secondary">Send one controlled staging test to an approved inbox. Provider acceptance does not confirm delivery.</p></header>
    <section className="rounded-2xl border border-border bg-surface p-5 sm:p-7"><h2 className="text-lg font-semibold">Send test email</h2>
      <form onSubmit={send} className="mt-4 space-y-4"><label className="block text-sm font-medium">Approved recipient email<input required type="email" autoComplete="email" value={recipient} onChange={(event) => setRecipient(event.target.value)} className="mt-2 w-full rounded-xl border border-border bg-background p-3 text-foreground" /></label>
        <label className="block text-sm font-medium">Test type<select value={kind} onChange={(event) => setKind(event.target.value as "basic" | "purchase")} className="mt-2 w-full rounded-xl border border-border bg-background p-3 text-foreground"><option value="basic">Basic staging test</option><option value="purchase">Synthetic purchase confirmation</option></select></label>
        <button disabled={busy || !health?.configuration.testingEnabled || !health.configuration.resendConfigured || !health.configuration.recipientsConfigured || !health.configuration.rateIndexReady} className="rounded-full bg-primary px-5 py-3 font-semibold text-background disabled:opacity-50">{busy ? "Sending…" : "Send Test Email"}</button></form>
      <p role="status" aria-live="polite" className="mt-4 text-sm text-foreground-secondary">{status}</p>
    </section>
    <section className="rounded-2xl border border-border bg-surface p-5 sm:p-7"><div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Outbox health</h2><button onClick={() => void refresh()} className="rounded-full border border-border px-4 py-2 text-sm">Refresh status</button></div>
      {health && <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4"><p>Pending: {health.pending}</p><p>Processing: {health.processing}</p><p>Retry: {health.retry}</p><p>Accepted by Resend: {health.sent}</p><p>Suppressed: {health.suppressed}</p><p>Dead letter: {health.deadLetter}</p><p className="col-span-2 sm:col-span-4">Oldest pending: {health.oldestPendingAt ? new Date(health.oldestPendingAt).toLocaleString("en-IN") : "None"}</p><p className="col-span-2 sm:col-span-4">Testing: {health.configuration.testingEnabled ? "enabled" : "disabled"} · Resend: {health.configuration.resendConfigured ? "configured" : "incomplete"} · Approved recipients: {health.configuration.recipientsConfigured ? "configured" : "missing"} · Rate limit: {health.configuration.rateIndexReady ? "ready" : "missing index"} · Worker: {health.configuration.workerConfigured ? "configured" : "incomplete"}</p></div>}
    </section>
  </main>;
}
