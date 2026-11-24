import { Suspense, type ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { resolveAdminRouteAccess, requireAdmin } from "@/lib/auth/admin";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { AdminNavigation } from "@/components/admin/admin-navigation";

export const metadata: Metadata = { title: "Admin area", robots: { index: false, follow: false } };

export default function AdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center px-6 text-sm text-foreground-secondary" role="status">Admin area load ho raha hai...</div>}>
      <AdminGate>{children}</AdminGate>
    </Suspense>
  );
}

async function AdminGate({ children }: Readonly<{ children: ReactNode }>) {
  const outcome = await resolveAdminRouteAccess(requireAdmin);
  if (outcome === "authentication") redirect("/admin/login");
  if (outcome === "authorization") {
    return (
        <main className="flex min-h-screen items-center justify-center px-5 py-16 sm:px-8">
          <section className="w-full max-w-xl rounded-[1.75rem] border border-border bg-surface p-8 shadow-[0_28px_80px_-48px_rgba(15,30,54,0.35)] sm:p-11">
            <p className="text-[11px] font-bold tracking-[0.18em] text-accent-foreground">ADMIN ACCESS</p>
            <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-foreground">Is area ke liye access nahi hai</h1>
            <p className="mt-4 text-sm leading-7 text-foreground-secondary">Is Google account ke liye admin permission verify nahi hui. Agar aap project ke approved owner hain, pehle sahi Google account se sign in karein; admin role sirf verified owner account ko secure bootstrap se mil sakta hai.</p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link href="/admin/login" className="inline-flex min-h-12 items-center justify-center rounded-full bg-primary px-6 text-sm font-semibold text-background transition-colors hover:bg-primary-hover">Admin Login par jaayein</Link>
              <SignOutButton compact redirectTo="/" />
            </div>
          </section>
        </main>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex min-h-[68px] max-w-6xl items-center justify-between gap-3 px-4 sm:min-h-[76px] sm:gap-6 sm:px-8">
          <div>
            <Link href="/admin" className="text-[11px] font-bold tracking-[0.09em] text-foreground sm:text-sm sm:tracking-[0.12em]">MONEYTREE<span className="text-accent-foreground">VENTURES</span></Link>
            <p className="mt-1 text-[10px] text-foreground-secondary sm:text-xs">Admin workspace</p>
          </div>
          <AdminNavigation />
        </div>
      </header>
      {children}
    </div>
  );
}
