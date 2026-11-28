import Link from "next/link";
import type { Metadata } from "next";
import { Suspense } from "react";
import Navbar from "@/components/layout/navbar";
import Footer from "@/components/layout/footer";
import LoginPanel from "@/components/auth/login-panel";

export const metadata: Metadata = { title: "Admin Login", robots: { index: false, follow: false } };

export default function AdminLoginPage() {
  return (
    <>
      <Navbar />
      <main className="flex flex-1 items-center justify-center px-5 py-16 sm:px-8 sm:py-24">
        <section className="w-full max-w-[520px] rounded-[1.75rem] border border-border bg-surface p-6 shadow-[0_28px_80px_-48px_rgba(15,30,54,0.35)] sm:p-10">
          <Link href="/" className="text-xs font-semibold tracking-[0.16em] text-accent-foreground">MONEY TREE VENTURE</Link>
          <p className="mt-8 text-[11px] font-bold tracking-[0.18em] text-foreground-secondary">RESTRICTED ACCESS</p>
          <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-[-0.05em] text-foreground sm:text-4xl">Admin Login</h1>
          <p className="mt-4 text-sm leading-7 text-foreground-secondary sm:text-base">
            This area is for the authorized administrator. Access is verified on the server after Google sign-in.
          </p>
          <div className="mt-8">
            <Suspense fallback={<div className="flex min-h-14 items-center justify-center rounded-xl border border-border bg-surface text-sm text-foreground-secondary" role="status">Login load ho raha hai...</div>}>
              <LoginPanel intent="admin" />
            </Suspense>
          </div>
          <Link href="/login" className="mt-5 inline-flex min-h-11 items-center text-sm font-semibold text-foreground-secondary underline decoration-border underline-offset-4 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-4">
            Back to User Login
          </Link>
        </section>
      </main>
      <Footer />
    </>
  );
}
