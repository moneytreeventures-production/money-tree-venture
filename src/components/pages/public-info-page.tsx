import type { ReactNode } from "react";
import Navbar from "@/components/layout/navbar";
import Footer from "@/components/layout/footer";

export interface InfoSection {
  title: string;
  content: ReactNode;
}

export function PublicInfoPage({
  eyebrow = "MoneyTreeVentures",
  title,
  intro,
  sections,
  draft = false,
}: {
  eyebrow?: string;
  title: string;
  intro: string;
  sections: InfoSection[];
  draft?: boolean;
}) {
  return <>
    <Navbar />
    <main className="flex-1">
      <div className="mx-auto w-full max-w-5xl px-5 py-12 sm:px-8 sm:py-16 lg:py-20">
        <header className="max-w-3xl border-l-2 border-accent pl-5 sm:pl-7">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground-secondary">{eyebrow}</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.045em] text-foreground sm:text-5xl">{title}</h1>
          <p className="mt-5 text-base leading-7 text-foreground-secondary sm:text-lg sm:leading-8">{intro}</p>
          <p className="mt-4 text-xs text-foreground-secondary">Last updated: 22 November 2026{draft ? " · Draft; not effective until approved and published" : ""}</p>
        </header>
        {draft && <aside className="mt-8 rounded-xl border border-accent/40 bg-accent/5 px-4 py-4 text-sm leading-6 text-foreground-secondary sm:px-5" aria-label="Draft for owner and legal review"><strong className="text-foreground">Draft for owner and legal review.</strong> This document is not represented as an effective policy. Confirm the business details and final wording before relying on or publishing it as final.</aside>}
        <div className="mt-10 divide-y divide-border border-y border-border">
          {sections.map((section) => <section key={section.title} className="py-7 sm:py-8"><h2 className="text-xl font-semibold tracking-tight text-foreground">{section.title}</h2><div className="mt-3 max-w-3xl text-sm leading-7 text-foreground-secondary sm:text-base">{section.content}</div></section>)}
        </div>
      </div>
    </main>
    <Footer />
  </>;
}
