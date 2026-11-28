import type { Metadata } from "next";
import Navbar from "@/components/layout/navbar";
import Footer from "@/components/layout/footer";
import CheckoutStart from "@/components/checkout/checkout-start";
import { Suspense } from "react";
import { connection } from "next/server";
import { paymentCollectionEnabled } from "@/lib/payments/payment-activation";

export const metadata: Metadata = {
  title: "Checkout",
  robots: { index: false, follow: false },
};

export default function CheckoutPage() {
  return (
    <>
      <Navbar />
      <Suspense fallback={<main className="mx-auto max-w-3xl px-5 py-16 text-foreground">Loading checkout…</main>}><CheckoutAvailability /></Suspense>
      <Footer />
    </>
  );
}

async function CheckoutAvailability() {
  await connection();
  if (!paymentCollectionEnabled(process.env)) return <main className="mx-auto max-w-3xl px-5 py-16 text-foreground"><h1 className="text-3xl font-semibold">Online purchases will be available soon.</h1><p className="mt-4 text-foreground-secondary">You can explore our products and their prices while checkout is unavailable.</p></main>;
  return <CheckoutStart />;
}
