import Link from "next/link";
import { ArrowDown, ArrowRight, BookOpen, Check, Sparkles } from "lucide-react";
import Reveal from "@/components/ui/reveal";

export default function HeroSection() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_77%_30%,rgba(249,115,22,0.10),transparent_34%),linear-gradient(to_right,transparent_0,transparent_calc(100%-1px),var(--border)_calc(100%-1px))] bg-[length:auto,8.333%_100%] opacity-60"
      />
      <div className="mt-container relative grid grid-cols-1 items-center gap-14 pb-20 pt-14 sm:pb-24 sm:pt-20 lg:min-h-[690px] lg:grid-cols-[0.95fr_1.05fr] lg:gap-6 lg:py-20">
        <Reveal className="relative z-10 min-w-0 max-w-[610px]">
          <div className="mb-7 inline-flex max-w-full flex-wrap items-center gap-2.5 rounded-full border border-border bg-surface/80 px-3.5 py-2 text-[10px] font-semibold tracking-[0.06em] text-foreground-secondary shadow-sm shadow-primary/5 sm:text-[11px] sm:tracking-[0.08em]">
            <Sparkles size={14} className="text-accent-foreground" />
            Resources to learn and get started
          </div>

          <h1 className="mt-display max-w-[680px] text-foreground">
            Shape your next idea.
          </h1>

          <p className="mt-7 max-w-[520px] text-[15px] leading-7 text-foreground-secondary sm:text-[17px] sm:leading-8">
            Thoughtfully made guides and starter kits for freelancing, design and online skills. Learn at your own pace, then apply things your way.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link
              href="#featured"
              className="mt-button mt-button-primary group h-[52px] gap-3 px-6 shadow-[0_10px_24px_-14px_var(--accent)] hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-13px_var(--accent)]"
            >
              Explore resources
              <ArrowRight size={17} className="transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              href="#how-it-works"
              className="mt-button mt-button-outline h-[52px] px-6"
            >
              How it works <ArrowDown size={15} />
            </Link>
          </div>

          <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-border pt-5 text-xs font-medium text-foreground-secondary sm:mt-12">
            <span className="inline-flex items-center gap-2"><Check size={14} className="text-accent-foreground" /> Practical learning</span>
            <span className="inline-flex items-center gap-2"><Check size={14} className="text-accent-foreground" /> Clear, simple language</span>
            <span className="inline-flex items-center gap-2"><Check size={14} className="text-accent-foreground" /> At your own pace</span>
          </div>
        </Reveal>

        <Reveal delay={0.12} className="relative mx-auto min-w-0 w-full max-w-[640px] lg:ml-auto" aria-hidden="true">
          <div className="relative mx-auto aspect-[1.08/1] w-full max-w-[610px] sm:aspect-[1.18/1]">
            <div className="absolute inset-[8%_5%_8%_8%] rounded-[2.5rem] border border-border/70 bg-surface/55" />
            <div className="absolute left-[8%] top-[7%] flex items-center gap-2 text-[10px] font-semibold tracking-[0.2em] text-foreground-secondary">
              <span className="size-1.5 rounded-full bg-accent" /> CURATED FOR YOUR NEXT STEP
            </div>

            <div className="absolute left-[10%] top-[22%] w-[57%] rotate-[-7deg] rounded-[5px] border border-border bg-white p-5 shadow-[0_24px_50px_-25px_rgba(15,30,54,0.35)] sm:p-7">
              <div className="flex items-center justify-between border-b border-[#e8edf3] pb-3 text-[9px] font-semibold tracking-[0.16em] text-[#6c7b90]">
                <span>EXPLORE IDEAS</span><span>MONEYTREEVENTURES</span>
              </div>
              <div className="mt-6 flex items-center gap-2 text-[9px] font-bold tracking-[0.17em] text-[#f97316]">
                <BookOpen size={13} /> LEARN AT YOUR PACE
              </div>
              <p className="mt-3 max-w-[260px] text-[clamp(1.35rem,3vw,2.25rem)] font-semibold leading-[1.02] tracking-[-0.06em] text-[#0f1e36]">
                Find a useful starting point.
              </p>
              <p className="mt-3 max-w-[230px] text-[10px] leading-5 text-[#68778b] sm:text-xs">
                Explore resources that match your interests and goals.
              </p>
              <div className="mt-5 flex items-center gap-2">
                <span className="h-1 w-[24%] rounded-full bg-[#f97316]" />
                <span className="h-1 w-[15%] rounded-full bg-[#e5eaf0]" />
                <span className="h-1 w-[20%] rounded-full bg-[#e5eaf0]" />
              </div>
            </div>

            <div className="absolute right-[4%] top-[18%] w-[38%] rotate-[7deg] rounded-[4px] bg-[#f5d5bd] p-3 shadow-[0_25px_50px_-25px_rgba(15,30,54,0.3)] sm:p-4">
              <div className="aspect-[0.82/1] overflow-hidden bg-[#e9b58e] p-3 sm:p-4">
                <div className="flex h-full flex-col justify-between border border-[#0f1e36]/20 p-3 sm:p-4">
                  <span className="text-[8px] font-bold tracking-[0.18em] text-[#0f1e36]/70">IDEAS TO EXPLORE</span>
                  <div>
                    <span className="block text-[clamp(1.3rem,3vw,2.7rem)] font-semibold leading-[0.86] tracking-[-0.07em] text-[#0f1e36]">Make<br />it clear.</span>
                    <span className="mt-3 block h-0.5 w-8 bg-[#f97316]" />
                  </div>
                  <span className="text-[8px] font-medium leading-4 text-[#0f1e36]/70">LAYOUT · TYPE · VISUAL FLOW</span>
                </div>
              </div>
            </div>

            <div className="absolute bottom-[12%] right-[7%] w-[42%] rotate-[4deg] rounded-2xl border border-border bg-surface p-4 shadow-[0_20px_50px_-30px_rgba(15,30,54,0.45)] sm:p-5">
              <div className="flex items-center justify-between text-[9px] font-bold tracking-[0.15em] text-foreground-secondary">
                <span>YOUR NEXT STEP</span><span className="rounded-full bg-accent/10 px-2 py-1 text-accent-foreground">AT YOUR PACE</span>
              </div>
              <p className="mt-4 text-[clamp(1rem,2vw,1.55rem)] font-semibold leading-tight tracking-[-0.045em] text-foreground">Write in your own voice.</p>
              <div className="mt-4 space-y-2.5">
                <div className="h-1.5 w-full rounded-full bg-surface-secondary" />
                <div className="h-1.5 w-[82%] rounded-full bg-surface-secondary" />
                <div className="h-1.5 w-[56%] rounded-full bg-accent/70" />
              </div>
            </div>

            <div className="absolute bottom-[10%] left-[5%] rounded-full border border-border bg-background px-3.5 py-2 text-[10px] font-semibold text-foreground shadow-lg shadow-primary/5 sm:left-[9%] sm:px-4 sm:py-2.5 sm:text-xs">
              Guides <span className="mx-1.5 text-accent-foreground">/</span> Starter kits <span className="mx-1.5 text-accent-foreground">/</span> Learning
            </div>
          </div>
        </Reveal>
      </div>
      <div className="border-y border-border bg-surface/70">
        <div className="mt-container flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-4 text-[10px] font-semibold tracking-[0.13em] text-foreground-secondary sm:text-[11px]">
          <span>PUT IDEAS INTO PRACTICE</span>
          <span className="hidden h-px flex-1 bg-border sm:block" />
          <span>CLEAR EXPLANATIONS</span>
          <span className="hidden h-px flex-1 bg-border sm:block" />
          <span>LEARN AT YOUR OWN PACE</span>
        </div>
      </div>
    </section>
  );
}
