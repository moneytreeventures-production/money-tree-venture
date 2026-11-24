import { ArrowDownRight, BookOpen, Compass, PencilRuler } from "lucide-react";
import Reveal from "@/components/ui/reveal";

export default function HowItWorks() {
  const steps = [
    { number: "01", title: "Explore products", description: "Browse PDF guides, bundles and 1:1 Call Guidance. Review the details and price.", icon: Compass },
    { number: "02", title: "Sign in and purchase", description: "Add a product to your cart, sign in with Google and complete checkout.", icon: BookOpen },
    { number: "03", title: "Access your purchase", description: "After payment is verified, eligible PDFs appear in your account. Call Guidance has a separate booking process.", icon: PencilRuler },
  ];
  return (
    <section id="how-it-works" className="scroll-mt-20 border-y border-border bg-background py-20 sm:py-28 lg:py-32">
      <div className="mx-auto max-w-[1360px] px-5 sm:px-8 lg:px-12">
        <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
          <Reveal className="max-w-lg">
            <p className="text-[11px] font-bold tracking-[0.18em] text-accent-foreground">A SIMPLE START</p>
            <h2 className="mt-4 text-3xl font-semibold leading-[1.08] tracking-[-0.05em] text-foreground sm:text-4xl lg:text-[3.4rem]">Learn in your own way.</h2>
            <p className="mt-5 max-w-md text-sm leading-7 text-foreground-secondary sm:text-base">No shortcuts—just useful information, clear direction and a good starting point for practice.</p>
            <div className="mt-8 inline-flex items-center gap-2 text-xs font-semibold text-foreground-secondary"><span className="flex size-8 items-center justify-center rounded-full border border-border"><ArrowDownRight size={15} className="text-accent-foreground"/></span> Browse at your pace</div>
          </Reveal>

          <div className="divide-y divide-border border-y border-border">
            {steps.map((step, index) => {
              const Icon = step.icon;
              return (
                <Reveal key={step.number} delay={index * 0.07}>
                  <article className="group grid gap-4 py-6 sm:grid-cols-[60px_1fr_40px] sm:items-start sm:gap-6 sm:py-8">
                    <span className="pt-1 text-xs font-semibold tracking-[0.12em] text-foreground-secondary/70">{step.number}</span>
                    <div>
                      <div className="flex items-center gap-3">
                        <h3 className="text-lg font-semibold tracking-[-0.03em] text-foreground sm:text-xl">{step.title}</h3>
                        <Icon size={17} strokeWidth={1.7} className="text-accent-foreground transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true" />
                      </div>
                      <p className="mt-2 max-w-xl text-sm leading-7 text-foreground-secondary">{step.description}</p>
                    </div>
                    <span aria-hidden="true" className="hidden size-9 items-center justify-center rounded-full border border-border text-foreground-secondary transition-colors group-hover:border-accent group-hover:text-accent-foreground sm:flex">↗</span>
                  </article>
                </Reveal>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
