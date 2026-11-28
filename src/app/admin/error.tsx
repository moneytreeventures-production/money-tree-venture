"use client";

export default function AdminError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="mx-auto w-full max-w-3xl px-5 py-12 sm:px-8"><section className="rounded-2xl border border-border bg-surface p-6 sm:p-8" role="alert"><p className="text-xs font-bold uppercase tracking-[0.16em] text-accent-foreground">Administrator workspace</p><h1 className="mt-3 text-2xl font-semibold text-foreground">This admin view is unavailable</h1><p className="mt-3 text-sm leading-7 text-foreground-secondary">The latest data could not be loaded. Retry this view to see the current state.</p><button type="button" onClick={reset} className="mt-button mt-6 rounded-full border border-border px-5 text-sm font-semibold text-foreground">Retry</button></section></main>;
}
