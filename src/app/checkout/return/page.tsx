import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentCustomer } from "@/lib/auth/session";
import { getCustomerOrderIdForCashfreeOrder, getVerifiedPaymentStatus } from "@/lib/payments/cashfree/payment-service";
import { getCustomerOrder } from "@/lib/checkout/order-service";
import { PaymentResult } from "@/components/checkout/payment-result";

interface ReturnPageProps { searchParams: Promise<{ order_id?: string | string[] }> }
export const metadata: Metadata = { title: "Payment result", robots: { index: false, follow: false } };

export default async function CheckoutReturnPage({ searchParams }: ReturnPageProps) {
  return <Suspense fallback={<main className="mx-auto grid min-h-[50vh] max-w-3xl place-items-center px-4 py-12"><p role="status" className="text-sm text-foreground-secondary">Verifying your payment securely…</p></main>}><CheckoutReturnContent searchParams={searchParams} /></Suspense>;
}

async function CheckoutReturnContent({ searchParams }: ReturnPageProps) {
  const customer = await getCurrentCustomer();
  if (!customer?._id) redirect("/login?next=%2Fcheckout%2Freturn");
  const query = await searchParams;
  const providerOrderId = typeof query.order_id === "string" ? query.order_id : "";
  let localOrderId: string | null = null;
  let resultOrder;
  try {
    // The provider ID is only an association key. The service enforces ownership,
    // fetches authoritative Cashfree state and runs the existing lifecycle.
    localOrderId = await getCustomerOrderIdForCashfreeOrder(providerOrderId, customer._id.toString());
    if (localOrderId) {
      try { resultOrder = await getVerifiedPaymentStatus(localOrderId, customer._id.toString()); }
      catch { resultOrder = await getCustomerOrder(localOrderId, customer._id.toString()); }
    }
  } catch {
    // Keep the result inconclusive without exposing provider or order details.
  }
  if (!resultOrder || !localOrderId) redirect("/account/orders?tab=processing");
  return <PaymentResult initialOrder={resultOrder as Parameters<typeof PaymentResult>[0]["initialOrder"]} />;
}
