import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireAdmin, resolveAdminRouteAccess } from "@/lib/auth/admin";
import { listAdminBookings } from "@/lib/fulfillment/booking-service";
import { AdminBookings } from "@/components/admin/admin-bookings";

export const metadata: Metadata = { title: "Call bookings", robots: { index: false, follow: false } };

export default async function AdminBookingsPage() {
  const access = await resolveAdminRouteAccess(requireAdmin);
  if (access === "authentication") redirect("/admin/login");
  if (access === "authorization") notFound();
  const result = await listAdminBookings({ page: 1, pageSize: 100 }) as {
    items: Array<{
      id: string; bookingReference: string; orderReference?: string;
      customer?: { name: string; email: string }; status: "awaiting_scheduling" | "scheduled" | "confirmed" | "completed" | "cancelled";
      requestedSlots: Array<{ startsAt: Date; endsAt: Date; timezone: string }>;
      timezone?: string; scheduledStartAt?: Date; sessionDurationMinutes: number;
      schedulingInstructions: string; customerNotes?: string; adminNotes?: string;
    }>;
  };
  return <main className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8 sm:py-16"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-foreground">ADMIN · 1:1 GUIDANCE</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">Call bookings</h1><p className="mt-3 max-w-2xl text-sm leading-7 text-foreground-secondary">Review customer requests, schedule and confirm calls, and update booking status.</p><AdminBookings bookings={result.items} /></main>;
}
