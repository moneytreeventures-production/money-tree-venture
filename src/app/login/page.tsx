import Link from "next/link";
import { Suspense } from "react";
import type { Metadata } from "next";
import Navbar from "@/components/layout/navbar";
import Footer from "@/components/layout/footer";
import LoginPanel from "@/components/auth/login-panel";

export const metadata: Metadata = { title: "Login", robots: { index: false, follow: false } };

export default function LoginPage() {
  return (
    <>
      <Navbar />
      <main className="flex flex-1 items-center justify-center px-5 py-16 sm:px-8 sm:py-24">
        <section className="w-full max-w-[520px] rounded-[1.75rem] border border-border bg-surface p-6 shadow-[0_28px_80px_-48px_rgba(15,30,54,0.35)] sm:p-10">
          <Link href="/" className="text-xs font-semibold tracking-[0.16em] text-accent-foreground">MONEY TREE VENTURE</Link>
          <p className="mt-8 text-[11px] font-bold tracking-[0.18em] text-foreground-secondary">SECURE SIGN IN</p>
          <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-[-0.05em] text-foreground sm:text-4xl">Sign in to Money Tree Venture</h1>
          <p className="mt-4 text-sm leading-7 text-foreground-secondary sm:text-base">
            Sign in securely with your Google account. Signing in does not add a purchase to your account.
          </p>
          <div className="mt-8">
            <Suspense fallback={<div className="flex min-h-14 items-center justify-center rounded-xl border border-border bg-surface text-sm text-foreground-secondary" role="status">Checking your session…</div>}>
              <LoginPanel />
            </Suspense>
          </div>
          <Link href="/admin/login" className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-full border border-border bg-surface px-5 text-sm font-semibold text-foreground transition-colors hover:bg-surface-secondary focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-4">
            Admin Login
          </Link>
          <p className="mt-6 border-t border-border pt-5 text-xs leading-6 text-foreground-secondary">
            Signing in continues with your account identity. No purchase or payment is processed here.
          </p>
        </section>
      </main>
      <Footer />
    </>
  );
}
