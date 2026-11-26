import { Suspense, type ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { resolveAdminRouteAccess, requireAdmin } from "@/lib/auth/admin";
import { AdminAccessDenied } from "@/components/admin/admin-access-denied";
import { AdminNavigation } from "@/components/admin/admin-navigation";
import { AmbientGlow } from "@/components/ui/ambient-glow";

export const metadata: Metadata = { title: "Admin area", robots: { index: false, follow: false } };

export default function AdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center px-6 text-sm text-foreground-secondary" role="status">Loading admin area...</div>}>
      <AdminGate>{children}</AdminGate>
    </Suspense>
  );
}

async function AdminGate({ children }: Readonly<{ children: ReactNode }>) {
  const outcome = await resolveAdminRouteAccess(requireAdmin);
  if (outcome === "authentication") redirect("/admin/login");
  if (outcome === "authorization") {
    return <AdminAccessDenied />;
  }

  return (
    <div className="relative min-h-screen bg-background">
      <AmbientGlow variant="quiet" />
      <header className="relative border-b border-border bg-surface">
        <div className="mx-auto flex min-h-[68px] max-w-[94rem] items-center justify-between gap-3 px-4 sm:min-h-[76px] sm:gap-6 sm:px-8">
          <div>
            <Link href="/admin" className="text-[11px] font-bold tracking-[0.09em] text-foreground sm:text-sm sm:tracking-[0.12em]">MONEYTREE<span className="text-accent-foreground">VENTURES</span></Link>
            <p className="mt-1 text-[10px] text-foreground-secondary sm:text-xs">Admin workspace</p>
          </div>
          <span className="hidden rounded-full border border-border bg-background px-3 py-1 text-xs font-semibold text-foreground-secondary xl:inline-flex">Administrator workspace</span>
          <AdminNavigation variant="mobile" />
        </div>
      </header>
      <div className="relative mx-auto flex w-full max-w-[94rem] gap-5 px-0 xl:px-8 xl:py-8">
        <aside className="hidden w-64 shrink-0 xl:block"><AdminNavigation variant="desktop" /></aside>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
