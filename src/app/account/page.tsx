import Link from "next/link";
import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentCustomer } from "@/lib/auth/session";
import { getCustomerAccountOverview } from "@/lib/checkout/order-service";
import { orderStatusLabel } from "@/lib/checkout/order-presentation";
import { formatINR } from "@/lib/format/currency";
import { AccountShell } from "@/components/account/account-shell";
import { SkeletonAccountContent } from "@/components/ui/skeleton";
import { ArrowUpRight, CalendarDays, Clock3, LibraryBig, ReceiptText } from "lucide-react";

export const metadata: Metadata = { title: "Your account", robots: { index: false, follow: false } };

export default function AccountPage() {
  return <Suspense fallback={<SkeletonAccountContent />}><AccountContent /></Suspense>;
}

async function AccountContent() {
  const customer = await getCurrentCustomer();
  if (!customer?._id) redirect("/login?next=%2Faccount");
  const overview = await getCustomerAccountOverview(customer._id.toString());
  const cards = [
    { label: "Purchased products", value: overview.purchasedProducts, href: "/account/library", icon: LibraryBig },
    { label: "Completed orders", value: overview.completedOrders, href: "/account/orders?tab=completed", icon: ReceiptText },
    { label: "Processing orders", value: overview.processingOrders, href: "/account/orders?tab=processing", icon: Clock3 },
    { label: "Consultation bookings", value: overview.bookingCount, href: "/account/bookings", icon: CalendarDays },
  ];
  return <AccountShell current="overview" title={`Welcome, ${customer.name}`} description="Your purchases, order activity and consultations in one place.">
    <section aria-label="Account summary" className="mt-9 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map((card) => <Link key={card.label} href={card.href} className="mt-card mt-card-interactive group min-w-0 p-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"><span className="flex size-11 items-center justify-center rounded-xl bg-surface-secondary text-accent-foreground"><card.icon size={20} aria-hidden="true" /></span><p className="mt-5 text-sm font-medium text-foreground-secondary">{card.label}</p><p className="mt-2 text-3xl font-semibold text-foreground">{card.value}</p><p className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-accent-foreground group-hover:underline">View details <ArrowUpRight size={14} aria-hidden="true" /></p></Link>)}</section>
    <section className="mt-10 rounded-2xl border border-border bg-surface p-5 sm:p-7"><h2 className="text-xl font-semibold text-foreground">Profile</h2><dl className="mt-5 grid gap-4 sm:grid-cols-2"><div><dt className="text-xs font-semibold uppercase tracking-wide text-foreground-secondary">Name</dt><dd className="mt-1 break-words text-sm font-medium text-foreground">{customer.name}</dd></div><div><dt className="text-xs font-semibold uppercase tracking-wide text-foreground-secondary">Google email</dt><dd className="mt-1 break-all text-sm font-medium text-foreground">{customer.email}</dd></div></dl><p className="mt-5 border-t border-border pt-4 text-xs text-foreground-secondary">Your downloads and order details are private to this account.</p></section>
    <section className="mt-10" aria-labelledby="recent-activity"><div className="flex flex-wrap items-end justify-between gap-3"><h2 id="recent-activity" className="text-xl font-semibold text-foreground">Recent activity</h2><Link href="/account/orders" className="inline-flex min-h-11 items-center text-sm font-semibold text-accent-foreground underline underline-offset-4">All orders</Link></div>{overview.recentOrders.length === 0 ? <p className="mt-4 rounded-2xl border border-border bg-surface p-6 text-sm text-foreground-secondary">No orders yet. <Link href="/products" className="font-semibold underline">Explore products</Link> to get started.</p> : <ul className="mt-4 grid gap-3">{overview.recentOrders.map((order) => <li key={order.id} className="min-w-0 rounded-2xl border border-border bg-surface p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="break-all font-semibold text-foreground">{order.orderReference}</p><p className="mt-2 break-words text-sm text-foreground-secondary">{order.lines.map((line) => line.productName).join(", ")}</p></div><span className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-foreground-secondary">{orderStatusLabel(order)}</span></div><div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4"><span className="text-sm font-semibold text-foreground">{formatINR(order.totalPaise)}</span><Link href={`/checkout/${order.id}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-accent-foreground underline underline-offset-4">View details</Link></div></li>)}</ul>}</section>
    <section className="mt-10 rounded-2xl border border-border bg-surface-secondary p-5 sm:p-7"><h2 className="text-lg font-semibold text-foreground">Need help with a purchase or booking?</h2><p className="mt-2 text-sm text-foreground-secondary">Our support page can help with order, download and consultation questions.</p><Link href="/contact" className="mt-button mt-5 inline-flex rounded-full border border-border bg-surface px-5 text-sm font-semibold text-foreground">Contact support</Link></section>
  </AccountShell>;
}
