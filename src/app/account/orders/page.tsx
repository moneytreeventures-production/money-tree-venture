import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentCustomer } from "@/lib/auth/session";
import { listCustomerOrderPage, type OrderHistoryTab } from "@/lib/checkout/order-service";
import { AccountShell } from "@/components/account/account-shell";
import { OrderHistory } from "@/components/account/order-history";
import { SkeletonAccountContent } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Order history", robots: { index: false, follow: false } };
type Search = Promise<{ tab?: string; page?: string }>;
const allowed = new Set<OrderHistoryTab>(["all", "processing", "completed", "closed", "archived"]);

export default function AccountOrdersPage({ searchParams }: { searchParams: Search }) {
  return <Suspense fallback={<SkeletonAccountContent label="Loading order history..." />}><OrdersContent searchParams={searchParams} /></Suspense>;
}

async function OrdersContent({ searchParams }: { searchParams: Search }) {
  const customer = await getCurrentCustomer();
  if (!customer?._id) redirect("/login?next=%2Faccount%2Forders");
  const query = await searchParams;
  const tab: OrderHistoryTab = allowed.has(query.tab as OrderHistoryTab) ? query.tab as OrderHistoryTab : "all";
  const requestedPage = Number(query.page ?? 1);
  const page = Number.isInteger(requestedPage) && requestedPage > 0 && requestedPage <= 100_000 ? requestedPage : 1;
  const result = await listCustomerOrderPage(customer._id.toString(), tab, page);
  return <AccountShell current="orders" title="Order History" description="Every retained order remains available, including expired, failed, refunded and archived orders. Archiving changes only your view."><OrderHistory orders={result.items} tab={tab} page={result.page} pageCount={result.pageCount} total={result.total} /></AccountShell>;
}
