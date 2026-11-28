"use client";

import Link from "next/link";

export default function AccountError({ retry }: { retry: () => void }) {
  return <main className="mx-auto w-full max-w-2xl px-4 py-16 sm:px-8" role="alert">
    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-foreground">Your account</p>
    <h1 className="mt-3 text-3xl font-semibold text-foreground">We could not load this account page.</h1>
    <p className="mt-3 text-sm leading-6 text-foreground-secondary">Your account information has not been changed. Please try again or return to your account overview.</p>
    <div className="mt-6 flex flex-wrap gap-3">
      <button type="button" onClick={() => retry()} className="inline-flex min-h-11 items-center rounded-full bg-accent px-5 text-sm font-semibold text-[#0f1e36] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">Try again</button>
      <Link href="/account" className="inline-flex min-h-11 items-center rounded-full border border-border px-5 text-sm font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">Account overview</Link>
      <Link href="/contact" className="inline-flex min-h-11 items-center text-sm font-semibold text-accent-foreground underline underline-offset-4">Contact support</Link>
    </div>
  </main>;
}
