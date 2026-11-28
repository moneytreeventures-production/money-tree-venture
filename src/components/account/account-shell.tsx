import Link from "next/link";
import { BookOpen, CalendarDays, House, LifeBuoy, LibraryBig, ReceiptText } from "lucide-react";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { AmbientGlow } from "@/components/ui/ambient-glow";

type AccountSection = "overview" | "library" | "orders" | "bookings";
const sections = [
  { id: "overview", href: "/account", label: "Overview", icon: House },
  { id: "library", href: "/account/library", label: "My Library", icon: LibraryBig },
  { id: "orders", href: "/account/orders", label: "Order History", icon: ReceiptText },
  { id: "bookings", href: "/account/bookings", label: "Consultations", icon: CalendarDays },
] as const;

function AccountLinks({ current }: { current: AccountSection }) {
  return <nav aria-label="Account navigation" className="grid gap-1">
    {sections.map(({ id, href, label, icon: Icon }) => <Link key={id} href={href} aria-current={current === id ? "page" : undefined} className={`flex min-h-11 items-center gap-3 rounded-xl border-l-[3px] px-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${current === id ? "border-accent bg-surface-secondary text-foreground" : "border-transparent text-foreground-secondary hover:bg-surface-secondary hover:text-foreground"}`}><Icon size={18} aria-hidden="true" />{label}</Link>)}
    <span className="my-3 border-t border-border" />
    <Link href="/products" className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-foreground-secondary hover:bg-surface-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"><BookOpen size={18} aria-hidden="true" />Explore products</Link>
    <Link href="/contact" className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-foreground-secondary hover:bg-surface-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"><LifeBuoy size={18} aria-hidden="true" />Contact support</Link>
  </nav>;
}

export function AccountShell({ title, description, current, children }: { title: string; description: string; current: AccountSection; children: React.ReactNode }) {
  return <main className="relative mx-auto w-full min-w-0 max-w-[94rem] px-4 py-8 sm:px-8 sm:py-10">
    <AmbientGlow />
    <div className="relative flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5"><Link href="/" className="text-xs font-bold tracking-[0.14em] text-accent-foreground">MONEY TREE VENTURE</Link><SignOutButton redirectTo="/" /></div>
    <div className="relative mt-7 flex min-w-0 gap-6">
      <aside className="hidden w-60 shrink-0 lg:block"><div className="sticky top-5 rounded-2xl border border-border bg-surface p-4 shadow-sm"><p className="mb-4 px-3 text-[11px] font-bold uppercase tracking-[0.16em] text-foreground-secondary">Your account</p><AccountLinks current={current} /></div></aside>
      <div className="min-w-0 flex-1">
        <details className="mb-7 rounded-2xl border border-border bg-surface p-3 lg:hidden"><summary className="flex min-h-11 cursor-pointer items-center px-2 text-sm font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">Account sections</summary><div className="border-t border-border pt-3"><AccountLinks current={current} /></div></details>
        <header><p className="text-xs font-bold uppercase tracking-[0.16em] text-accent-foreground">Your account</p><h1 className="mt-2 break-words text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">{title}</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-foreground-secondary">{description}</p></header>
        {children}
      </div>
    </div>
  </main>;
}
