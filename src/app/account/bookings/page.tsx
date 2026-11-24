import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentCustomer } from "@/lib/auth/session";
import { listCustomerBookings } from "@/lib/fulfillment/booking-service";
import { AccountShell } from "@/components/account/account-shell";
import { AccountResources } from "@/components/account/account-resources";

export const metadata: Metadata = { title: "Consultations", robots: { index: false, follow: false } };

export default function AccountBookingsPage() {
  return <Suspense fallback={<main className="mx-auto max-w-6xl px-5 py-16 text-sm text-foreground-secondary" role="status">Loading consultations...</main>}><BookingsContent /></Suspense>;
}

async function BookingsContent() {
  const customer = await getCurrentCustomer();
  if (!customer?._id) redirect("/login?next=%2Faccount%2Fbookings");
  const bookings = await listCustomerBookings(customer._id.toString());
  return <AccountShell title="Consultations" description="Review your 1:1 Call Guidance bookings and send a preferred time when scheduling is available."><AccountResources purchases={[]} bookings={bookings} showLibrary={false} /></AccountShell>;
}
