import Link from "next/link";
import { SignOutButton } from "@/components/auth/sign-out-button";

export function AccountShell({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  const linkClass = "inline-flex min-h-11 items-center rounded-full border border-border px-4 text-sm font-semibold text-foreground transition-colors hover:border-accent hover:bg-surface-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
  return <main className="mx-auto w-full min-w-0 max-w-6xl px-4 py-10 sm:px-8 sm:py-14">
    <div className="flex flex-wrap items-center justify-between gap-4"><Link href="/" className="text-xs font-bold tracking-[0.14em] text-accent-foreground">MONEYTREEVENTURES</Link><SignOutButton redirectTo="/" /></div>
    <div className="mt-9"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-foreground">Your account</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">{title}</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-foreground-secondary">{description}</p></div>
    <nav aria-label="Account navigation" className="mt-7 flex flex-wrap gap-2 sm:gap-3">
      <Link href="/account" className={linkClass}>Overview</Link><Link href="/account/library" className={linkClass}>My Library</Link><Link href="/account/orders" className={linkClass}>Order History</Link><Link href="/account/bookings" className={linkClass}>Consultations</Link><Link href="/" className={linkClass}>Home</Link><Link href="/products" className={linkClass}>Explore Products</Link>
    </nav>
    {children}
  </main>;
}
