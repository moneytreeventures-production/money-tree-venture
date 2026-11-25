import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCurrentCustomer } from "@/lib/auth/session";
import { getCustomerOrder } from "@/lib/checkout/order-service";
import { NotFoundError } from "@/lib/errors/app-error";
import { HostedCheckout } from "@/components/checkout/hosted-checkout";
import { PaymentStatusCheck } from "@/components/checkout/payment-status-check";
import { RetryExpiredOrder } from "@/components/checkout/retry-expired-order";
import { formatINR } from "@/lib/format/currency";
import { orderPaymentMessage } from "@/lib/checkout/order-presentation";
import Link from "next/link";

interface CheckoutPageProps { params: Promise<{ orderId: string }> }
export const metadata: Metadata = { title: "Checkout", robots: { index: false, follow: false } };
interface CheckoutOrder {
  id?: string; orderReference?: string; lines?: Array<{ productName?: string; quantity?: number; lineTotalPaise?: number }>;
  subtotalPaise?: number; discountPaise?: number; taxPaise?: number; totalPaise?: number; currency?: string;
  couponSnapshot?: { code?: string; discountPaise?: number }; orderStatus?: string; paymentStatus?: string; paymentExpired?: boolean;
}

export default async function CheckoutPage({ params }: CheckoutPageProps) {
  return (
    <Suspense fallback={<main className="mx-auto w-full max-w-3xl px-5 py-12 text-sm text-foreground-secondary sm:px-8">Loading order details…</main>}>
      <CheckoutContent params={params} />
    </Suspense>
  );
}

async function CheckoutContent({ params }: CheckoutPageProps) {
  const { orderId } = await params;
  const customer = await getCurrentCustomer();
  if (!customer?._id) redirect("/login");
  let order: CheckoutOrder;
  try {
    order = await getCustomerOrder(orderId, customer._id.toString()) as CheckoutOrder;
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const isExpired = order.paymentExpired === true;
  const payable = order.orderStatus === "awaiting_payment" && order.paymentStatus === "unpaid" && !isExpired &&
    typeof order.totalPaise === "number" && typeof order.id === "string" && typeof order.orderReference === "string";
  return (
    <main className="mx-auto w-full min-w-0 max-w-3xl px-4 py-10 sm:px-8 sm:py-16">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-foreground">MoneyTreeVentures · Checkout</p>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Order details</h1>
      <ul className="mt-8 divide-y divide-border border-y border-border">
        {(order.lines ?? []).map((line, index) => (
          <li key={`${line.productName ?? "product"}-${index}`} className="flex flex-wrap items-start justify-between gap-x-5 gap-y-1 py-4 sm:flex-nowrap">
            <span className="min-w-0 break-words text-sm font-medium text-foreground">{line.productName} <span className="text-foreground-secondary">× {line.quantity}</span></span>
            <span className="shrink-0 text-sm text-foreground">{formatINR((line.lineTotalPaise ?? 0) as number)}</span>
          </li>
        ))}
        <li className="flex justify-between gap-5 py-3 text-sm text-foreground-secondary"><span>Subtotal</span><span>{formatINR(order.subtotalPaise ?? 0)}</span></li>
        {!!order.discountPaise && <li className="flex justify-between gap-3 py-3 text-sm text-foreground-secondary"><span className="min-w-0 break-all">{order.couponSnapshot?.code ? `Coupon ${order.couponSnapshot.code}` : "Coupon discount"}</span><span className="shrink-0">−{formatINR(order.discountPaise)}</span></li>}
        {!!order.taxPaise && <li className="flex justify-between gap-5 py-3 text-sm text-foreground-secondary"><span>Tax recorded on this order</span><span>{formatINR(order.taxPaise)}</span></li>}
        <li className="flex justify-between gap-5 py-5 text-base font-semibold text-foreground"><span>Total · INR</span><span>{formatINR(order.totalPaise ?? 0)}</span></li>
      </ul>
      {!!order.taxPaise && <p className="mt-4 text-xs leading-5 text-foreground-secondary">This historical order shows the tax amount recorded at purchase. This summary is not a GST tax invoice. <Link href="/billing-information" className="underline underline-offset-2">Read Billing Information</Link>.</p>}
      {order.paymentStatus === "pending" && <p className="mt-6 rounded-xl border border-border bg-surface px-5 py-4 text-sm leading-6 text-foreground-secondary" role="status">Payment is processing. This page will check the status automatically. Verification can continue if you leave this page.</p>}
      {order.paymentStatus === "failed" && !isExpired && <p className="mt-6 rounded-xl border border-border bg-surface px-5 py-4 text-sm leading-6 text-foreground-secondary" role="status">The last payment attempt did not complete. We are confirming whether this order is safe to retry. Check its status below.</p>}
      {payable && <HostedCheckout orderId={order.id!} orderReference={order.orderReference!} totalPaise={order.totalPaise!} />}
      {order.id && <PaymentStatusCheck orderId={order.id} autoCheck={order.paymentStatus === "pending" || (order.paymentStatus === "failed" && order.orderStatus === "awaiting_payment")} />}
      {order.id && order.orderStatus === "expired" && order.paymentStatus === "failed" && <div className="mt-6"><RetryExpiredOrder orderId={order.id} /></div>}
      {!payable && <p className="mt-8 rounded-xl border border-border bg-surface px-5 py-4 text-sm leading-6 text-foreground-secondary" role="status">{orderPaymentMessage(order.orderStatus, order.paymentStatus, isExpired)}</p>}
      <nav aria-label="Order navigation" className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold text-accent-foreground">
        <Link href="/account/orders" className="min-h-10 content-center underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-accent">View My Orders</Link>
        <Link href="/products" className="min-h-10 content-center underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-accent">Continue Shopping</Link>
        <Link href="/" className="min-h-10 content-center underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-accent">Return to Home</Link>
      </nav>
    </main>
  );
}
