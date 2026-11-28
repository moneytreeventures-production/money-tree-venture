import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";

export default function HomeGuidance() {
  return <section aria-labelledby="home-guidance-title" className="border-t border-border bg-background py-16 sm:py-24">
    <div className="mt-container grid gap-10 lg:grid-cols-[1fr_1.15fr] lg:items-center lg:gap-16">
      <div>
        <p className="mt-eyebrow">Before you choose</p>
        <h2 id="home-guidance-title" className="mt-4 max-w-lg text-3xl font-semibold leading-tight tracking-[-0.045em] text-foreground sm:text-4xl">Find the right starting point.</h2>
        <p className="mt-5 max-w-xl text-sm leading-7 text-foreground-secondary sm:text-base">Review each resource&apos;s details and price before you buy. Your account keeps your orders and eligible PDF purchases together.</p>
        <Link href="/faqs" className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-accent-foreground underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-accent">Read common questions <ArrowUpRight size={16} aria-hidden="true" /></Link>
      </div>
      <div className="rounded-[1.75rem] bg-[#0f1e36] p-6 text-white sm:p-9">
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="border-b border-white/15 pb-5 sm:border-b-0 sm:border-r sm:pb-0 sm:pr-5">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-orange-300">PDF guides and bundles</p>
            <p className="mt-3 text-sm leading-6 text-slate-200">After a verified purchase, eligible PDFs are available from your account library.</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-orange-300">1:1 Call Guidance</p>
            <p className="mt-3 text-sm leading-6 text-slate-200">Call Guidance has a separate booking process after purchase.</p>
          </div>
        </div>
        <Link href="/products" className="mt-button mt-button-primary mt-8 w-full sm:w-auto">Explore all products <ArrowRight size={17} aria-hidden="true" /></Link>
      </div>
    </div>
  </section>;
}
