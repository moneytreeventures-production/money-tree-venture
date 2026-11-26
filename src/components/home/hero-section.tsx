import Link from "next/link";
import { ArrowDown, ArrowRight, Check, Sparkles } from "lucide-react";
import Reveal from "@/components/ui/reveal";
import HeroDepth from "./hero-depth";

export default function HeroSection() {
  return <section className="relative overflow-hidden">
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_77%_30%,rgba(249,115,22,0.10),transparent_34%),linear-gradient(to_right,transparent_0,transparent_calc(100%-1px),var(--border)_calc(100%-1px))] bg-[length:auto,8.333%_100%] opacity-60" />
    <div className="mt-container relative grid grid-cols-1 items-center gap-12 pb-16 pt-12 sm:pb-20 sm:pt-20 lg:min-h-[690px] lg:grid-cols-[0.95fr_1.05fr] lg:gap-8 lg:py-20">
      <Reveal className="relative z-10 min-w-0 max-w-[610px]">
        <div className="mb-7 inline-flex max-w-full flex-wrap items-center gap-2.5 rounded-full border border-border bg-surface/80 px-3.5 py-2 text-[10px] font-semibold tracking-[0.06em] text-foreground-secondary shadow-sm shadow-primary/5 sm:text-[11px] sm:tracking-[0.08em]">
          <Sparkles size={14} className="text-accent-foreground" aria-hidden="true" />
          Resources to learn and get started
        </div>
        <h1 className="mt-display max-w-[680px] text-foreground">Shape your next idea.</h1>
        <p className="mt-7 max-w-[520px] text-[15px] leading-7 text-foreground-secondary sm:text-[17px] sm:leading-8">
          Thoughtfully made guides and starter kits for freelancing, design and online skills. Learn at your own pace, then apply things your way.
        </p>
        <div className="mt-9 flex flex-col gap-3 sm:flex-row">
          <Link href="#featured" className="mt-button mt-button-primary group h-[52px] gap-3 px-6 shadow-[0_10px_24px_-14px_var(--accent)] hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-13px_var(--accent)]">
            Explore resources <ArrowRight size={17} aria-hidden="true" className="transition-transform group-hover:translate-x-1" />
          </Link>
          <Link href="#how-it-works" className="mt-button mt-button-outline h-[52px] px-6">How it works <ArrowDown size={15} aria-hidden="true" /></Link>
        </div>
        <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-border pt-5 text-xs font-medium text-foreground-secondary sm:mt-12">
          <span className="inline-flex items-center gap-2"><Check size={14} aria-hidden="true" className="text-accent-foreground" /> Practical learning</span>
          <span className="inline-flex items-center gap-2"><Check size={14} aria-hidden="true" className="text-accent-foreground" /> Clear, simple language</span>
          <span className="inline-flex items-center gap-2"><Check size={14} aria-hidden="true" className="text-accent-foreground" /> At your own pace</span>
        </div>
      </Reveal>

      <HeroDepth />
    </div>
    <div className="border-y border-border bg-surface/70">
      <div className="mt-container flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-4 text-[10px] font-semibold tracking-[0.13em] text-foreground-secondary sm:text-[11px]">
        <span>PUT IDEAS INTO PRACTICE</span><span className="hidden h-px flex-1 bg-border sm:block" />
        <span>CLEAR EXPLANATIONS</span><span className="hidden h-px flex-1 bg-border sm:block" />
        <span>LEARN AT YOUR OWN PACE</span>
      </div>
    </div>
  </section>;
}
