import Link from "next/link";
import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentCustomer } from "@/lib/auth/session";
import { listCustomerLibraryPage } from "@/lib/fulfillment/download-service";
import { AccountShell } from "@/components/account/account-shell";
import { AccountResources } from "@/components/account/account-resources";
import { SkeletonAccountContent } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "My Library", robots: { index: false, follow: false } };
type Search = Promise<{ page?: string }>;

export default function AccountLibraryPage({ searchParams }: { searchParams: Search }) {
  return <Suspense fallback={<SkeletonAccountContent label="Loading your library..." />}><LibraryContent searchParams={searchParams} /></Suspense>;
}

async function LibraryContent({ searchParams }: { searchParams: Search }) {
  const customer = await getCurrentCustomer();
  if (!customer?._id) redirect("/login?next=%2Faccount%2Flibrary");
  const query = await searchParams;
  const requestedPage = Number(query.page ?? 1);
  const page = Number.isInteger(requestedPage) && requestedPage > 0 && requestedPage <= 100_000 ? requestedPage : 1;
  const result = await listCustomerLibraryPage(customer._id.toString(), page);
  return <AccountShell title="My Library" description="Download your verified PDF purchases securely. Buying the same PDF again does not remove access to a valid earlier purchase.">
    <p className="mt-8 text-sm text-foreground-secondary">{result.total} {result.total === 1 ? "product" : "products"} with active PDF access</p>
    <AccountResources purchases={result.items} bookings={[]} showBookings={false} />
    {result.pageCount > 1 && <nav aria-label="Library pages" className="mt-6 flex items-center justify-between gap-3"><span className="text-sm text-foreground-secondary">Page {result.page} of {result.pageCount}</span><div className="flex gap-2">{page > 1 && <Link href={`/account/library?page=${page - 1}`} className="inline-flex min-h-11 items-center rounded-full border border-border px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-accent">Previous</Link>}{page < result.pageCount && <Link href={`/account/library?page=${page + 1}`} className="inline-flex min-h-11 items-center rounded-full border border-border px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-accent">Next</Link>}</div></nav>}
  </AccountShell>;
}
