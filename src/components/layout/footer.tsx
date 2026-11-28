import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { BrandLogo } from "./brand-logo";

const exploreLinks = [
  ["Home", "/"],
  ["Explore Products", "/products"],
  ["About Us", "/about"],
] as const;
const supportLinks = [
  ["FAQs", "/faqs"],
  ["Contact Us", "/contact"],
  ["My Library", "/account/library"],
  ["My Orders", "/account/orders"],
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
  return <footer className="mt-auto border-t border-border bg-surface/60">
    <div className="mt-container pb-7 pt-12 sm:pt-14">
      <div className="grid gap-10 border-b border-border pb-10 sm:grid-cols-2 sm:gap-12 xl:grid-cols-[1.5fr_.8fr_.9fr_1.2fr] xl:pb-12">
        <div>
          <Link href="/" aria-label="Money Tree Venture — homepage" className="inline-flex items-center gap-3">
            <BrandLogo />
            <span className="flex flex-col leading-none"><span className="text-base font-bold tracking-tight text-foreground">Money Tree <span className="text-accent-foreground">Venture</span></span><span className="mt-1.5 text-[9px] font-semibold tracking-[0.08em] text-foreground-secondary">LEARN MORE · EXPLORE MORE · GROW MORE</span></span>
          </Link>
          <p className="mt-5 max-w-md text-sm leading-7 text-foreground-secondary">Learn More. Explore More. Grow More. Digital resources and separate online consultation services.</p>
        </div>
        <LinkList title="Explore" links={exploreLinks} />
        <LinkList title="Customer care" links={supportLinks} />
        <LinkList title="Policies" links={legalLinks} />
      </div>
      <div className="flex flex-col justify-between gap-3 pt-6 text-[11px] text-foreground-secondary sm:flex-row sm:items-center">
        <p>© Money Tree Venture. All rights reserved.</p>
        <p>Learn More. Explore More. Grow More.</p>
      </div>
    </div>
  </footer>;
}
