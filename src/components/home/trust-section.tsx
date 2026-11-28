import Reveal from "@/components/ui/reveal";

export default function TrustSection() {
  const principles = [
    { number: "01", title: "Clear focus", description: "You should understand what a resource covers from the start." },
    { number: "02", title: "Plain language", description: "Concepts should be explained simply, without unnecessary jargon." },
    { number: "03", title: "Realistic expectations", description: "Guides can support learning and planning; outcomes depend on your practice and situation." },
  ];
  return (
    <section id="about" className="scroll-mt-20 bg-surface py-20 sm:py-28 lg:py-32">
      <div className="mx-auto grid max-w-[1360px] gap-12 px-5 sm:px-8 lg:grid-cols-[0.92fr_1.08fr] lg:items-center lg:gap-24 lg:px-12">
        <Reveal className="relative overflow-hidden rounded-[1.75rem] bg-[#0f1e36] p-7 text-white sm:p-10 lg:p-12">
          <div aria-hidden="true" className="absolute -right-16 -top-16 size-64 rounded-full border border-white/10" />
          <div aria-hidden="true" className="absolute -right-6 -top-6 size-44 rounded-full border border-white/10" />
          <div className="relative">
            <p className="text-[10px] font-bold tracking-[0.2em] text-orange-300">MONEY TREE VENTURE</p>
            <h2 className="mt-6 max-w-md text-3xl font-semibold leading-[1.04] tracking-[-0.05em] sm:text-4xl lg:text-[3.35rem]">Start growing with clarity.</h2>
            <p className="mt-5 max-w-md text-sm leading-7 text-slate-300">We focus on making useful digital learning resources simple and approachable so you can make informed choices.</p>
            <div className="mt-9 flex items-center gap-3 border-t border-white/15 pt-5 text-xs font-medium text-slate-300">
              <span className="size-2 rounded-full bg-orange-400" /> Learn More · Explore More · Grow More
            </div>
          </div>
        </Reveal>

        <div>
          <Reveal>
          <p className="text-[11px] font-bold tracking-[0.18em] text-accent-foreground">WHAT WE FOCUS ON</p>
            <h2 className="mt-4 max-w-xl text-3xl font-semibold leading-[1.08] tracking-[-0.05em] text-foreground sm:text-4xl">Understand first. Choose your path next.</h2>
          </Reveal>
          <div className="mt-8 divide-y divide-border border-y border-border">
            {principles.map((principle, index) => (
              <Reveal key={principle.number} delay={index * 0.06}>
                <article className="grid grid-cols-[38px_1fr] gap-3 py-5 sm:grid-cols-[48px_1fr] sm:gap-4 sm:py-6">
                  <span className="pt-0.5 text-[10px] font-bold tracking-[0.12em] text-accent-foreground">{principle.number}</span>
                  <div>
                    <h3 className="text-base font-semibold tracking-[-0.02em] text-foreground">{principle.title}</h3>
                    <p className="mt-1.5 max-w-lg text-sm leading-6 text-foreground-secondary">{principle.description}</p>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
