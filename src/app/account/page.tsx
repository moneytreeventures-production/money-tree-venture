import Link from "next/link";
import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentCustomer } from "@/lib/auth/session";
import { getCustomerAccountOverview } from "@/lib/checkout/order-service";
import { orderStatusLabel } from "@/lib/checkout/order-presentation";
import { formatINR } from "@/lib/format/currency";
import { AccountShell } from "@/components/account/account-shell";

export const metadata: Metadata = { title: "Your account", robots: { index: false, follow: false } };

export default function AccountPage() {
  return <Suspense fallback={<main className="mx-auto max-w-6xl px-5 py-16 text-sm text-foreground-secondary" role="status">Loading your account...</main>}><AccountContent /></Suspense>;
}

async function AccountContent() {
  const customer = await getCurrentCustomer();
  if (!customer?._id) redirect("/login?next=%2Faccount");
  const overview = await getCustomerAccountOverview(customer._id.toString());
  const cards = [
    { label: "Purchased products", value: overview.purchasedProducts, href: "/account/library" },
    { label: "Completed orders", value: overview.completedOrders, href: "/account/orders?tab=completed" },
    { label: "Processing orders", value: overview.processingOrders, href: "/account/orders?tab=processing" },
    { label: "Consultation bookings", value: overview.bookingCount, href: "/account/bookings" },
  ];
  return <AccountShell title={`Welcome, ${customer.name}`} description="Your purchases, order activity and consultations in one place.">
    <section aria-label="Account summary" className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{cards.map((card) => <Link key={card.label} href={card.href} className="group rounded-2xl border border-border bg-surface p-5 transition-all hover:-translate-y-0.5 hover:border-accent hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"><p className="text-sm text-foreground-secondary">{card.label}</p><p className="mt-3 text-3xl font-semibold text-foreground">{card.value}</p><p className="mt-3 text-xs font-semibold text-accent-foreground group-hover:underline">View details</p></Link>)}</section>
    <section className="mt-10 rounded-2xl border border-border bg-surface p-5 sm:p-7"><h2 className="text-xl font-semibold text-foreground">Profile</h2><p className="mt-3 break-words text-sm text-foreground-secondary">{customer.name} · {customer.email}</p><p className="mt-2 text-xs text-foreground-secondary">Signed in with Google. Your downloads and order details are private to this account.</p></section>
    <section className="mt-10" aria-labelledby="recent-activity"><div className="flex flex-wrap items-end justify-between gap-3"><h2 id="recent-activity" className="text-xl font-semibold text-foreground">Recent activity</h2><Link href="/account/orders" className="text-sm font-semibold text-accent-foreground underline underline-offset-4">All orders</Link></div>{overview.recentOrders.length === 0 ? <p className="mt-4 rounded-2xl border border-border p-6 text-sm text-foreground-secondary">No orders yet. <Link href="/products" className="font-semibold underline">Explore Products</Link> to get started.</p> : <ul className="mt-4 grid gap-3">{overview.recentOrders.map((order) => <li key={order.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4"><div><p className="font-semibold text-foreground">{order.orderReference}</p><p className="mt-1 text-xs text-foreground-secondary">{orderStatusLabel(order)} · {order.lines.map((line) => line.productName).join(", ")}</p></div><div className="flex items-center gap-4"><span className="text-sm font-semibold text-foreground">{formatINR(order.totalPaise)}</span><Link href={`/checkout/${order.id}`} className="text-sm font-semibold text-accent-foreground underline underline-offset-4">View details</Link></div></li>)}</ul>}</section>
  </AccountShell>;
}
