import Link from "next/link";
import { ArrowUpRight, Sprout } from "lucide-react";

const exploreLinks = [
  ["Explore Products", "/products"],
  ["About Us", "/about"],
  ["FAQs", "/faqs"],
  ["Contact Us", "/contact"],
] as const;
const legalLinks = [
  ["Privacy Policy", "/privacy-policy"],
  ["Terms and Conditions", "/terms"],
  ["Refund & Cancellation Policy", "/refund-policy"],
  ["Billing Information", "/billing-information"],
  ["Shipping & Delivery Policy", "/shipping-delivery"],
] as const;

function LinkList({ title, links }: { title: string; links: ReadonlyArray<readonly [string, string]> }) {
  return <nav aria-label={title}>
    <h2 className="text-[10px] font-bold tracking-[0.17em] text-foreground">{title}</h2>
    <ul className="mt-4 flex flex-col items-start gap-3">
      {links.map(([label, href]) => <li key={href}><Link href={href} className="group inline-flex min-h-11 items-center gap-1.5 text-sm text-foreground-secondary transition-colors hover:text-foreground focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">{label}<ArrowUpRight size={13} aria-hidden="true" className="text-accent-foreground opacity-0 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:opacity-100" /></Link></li>)}
    </ul>
  </nav>;
}

export default function Footer() {
  return <footer className="border-t border-border bg-background">
    <div className="mt-container pb-7 pt-12 sm:pt-14">
      <div className="grid gap-10 border-b border-border pb-10 sm:grid-cols-2 sm:gap-12 lg:grid-cols-[1.2fr_.8fr_1.2fr] lg:pb-12">
        <div>
          <Link href="/" aria-label="MoneyTreeVentures — homepage" className="inline-flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-background"><Sprout size={21} strokeWidth={1.8} /></span>
            <span className="flex flex-col leading-none"><span className="text-base font-bold tracking-tight text-foreground">MoneyTree<span className="text-accent-foreground">Ventures</span></span><span className="mt-1.5 text-[9px] font-semibold tracking-[0.08em] text-foreground-secondary">LEARN MORE · EXPLORE MORE · GROW MORE</span></span>
          </Link>
          <p className="mt-5 max-w-md text-sm leading-7 text-foreground-secondary">Learn More. Explore More. Grow More. Digital resources and separate online consultation services.</p>
        </div>
        <LinkList title="EXPLORE" links={exploreLinks} />
        <LinkList title="LEGAL" links={legalLinks} />
      </div>
      <div className="flex flex-col justify-between gap-3 pt-6 text-[11px] text-foreground-secondary sm:flex-row sm:items-center">
        <p>© MoneyTreeVentures. All rights reserved.</p>
        <p>Learn More. Explore More. Grow More.</p>
      </div>
    </div>
  </footer>;
}
