import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { getAdminDashboardCounts } from "@/lib/catalog/admin-dashboard-service";
import { ManageProductsLink } from "@/components/admin/manage-products-link";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminHomePage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-8">
      <header className="max-w-3xl">
        <p className="text-[11px] font-bold tracking-[0.18em] text-accent-foreground">ADMINISTRATION</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.055em] text-foreground sm:text-5xl">Workspace overview</h1>
        <p className="mt-4 text-base leading-7 text-foreground-secondary">A snapshot of your catalogue and daily operations.</p>
      </header>
      <Suspense fallback={<DashboardOverviewFallback />}>
        <DashboardOverview />
      </Suspense>
    </main>
  );
}

async function DashboardOverview() {
  await connection();
  const counts = await getAdminDashboardCounts();
  const metrics = [
    { label: "Products", value: counts.products, detail: `${counts.publishedProducts} published · ${counts.draftProducts} drafts · ${counts.archivedProducts} archived`, href: "/admin/products" },
    { label: "Categories", value: counts.categories, detail: "Organize the public catalogue", href: "/admin/categories" },
    { label: "Orders", value: counts.orders, detail: "Orders placed through checkout" },
    { label: "Customers", value: counts.customers, detail: "Active and blocked customer profiles" },
    { label: "Bookings to schedule", value: counts.pendingBookings, detail: "Call Guidance bookings awaiting scheduling", href: "/admin/bookings" },
  ];

  return (
    <>
      <section aria-label="Workspace totals" className="mt-9 grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
        {metrics.map((metric) => {
          const content = <><p className="text-sm font-medium text-foreground-secondary">{metric.label}</p><p className="mt-3 text-4xl font-semibold tracking-tight text-foreground">{metric.value.toLocaleString("en-IN")}</p><p className="mt-3 text-sm leading-6 text-foreground-secondary">{metric.detail}</p></>;
          return metric.href ? <Link key={metric.label} href={metric.href} className="mt-card mt-card-interactive block min-w-0 p-6 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">{content}<span className="mt-5 inline-block text-sm font-semibold text-accent-foreground">Manage {metric.label.toLowerCase()} →</span></Link> : <article key={metric.label} className="mt-card min-w-0 p-6">{content}</article>;
        })}
      </section>
      <section className="mt-9 rounded-2xl border border-border bg-surface p-6 sm:p-8">
        <h2 className="text-lg font-semibold text-foreground">Operations shortcuts</h2>
        <ul className="mt-4 flex flex-wrap gap-3">
          <li><ManageProductsLink /></li>
          <li><Link href="/admin/categories" className="inline-flex min-h-11 items-center rounded-full border border-border px-5 text-sm font-semibold text-foreground hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">Manage categories</Link></li>
          <li><Link href="/admin/bookings" className="inline-flex min-h-11 items-center rounded-full border border-border px-5 text-sm font-semibold text-foreground hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">Manage bookings</Link></li>
          <li><Link href="/admin/reviews" className="inline-flex min-h-11 items-center rounded-full border border-border px-5 text-sm font-semibold text-foreground hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">Moderate reviews</Link></li>
          <li><Link href="/admin/support" className="inline-flex min-h-11 items-center rounded-full border border-border px-5 text-sm font-semibold text-foreground hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">Support inbox</Link></li>
        </ul>
      </section>
    </>
  );
}

function DashboardOverviewFallback() {
  return <section aria-label="Workspace totals loading" className="mt-9"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">{[0, 1, 2, 3, 4].map((index) => <div key={index} className="rounded-2xl border border-border bg-surface p-6"><Skeleton className="h-4 w-24" /><Skeleton className="mt-4 h-10 w-16" /><Skeleton className="mt-4 h-4 w-2/3" /></div>)}</div><span className="sr-only" role="status">Loading workspace totals...</span></section>;
}
