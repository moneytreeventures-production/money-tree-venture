import Link from "next/link";
import { SignOutButton } from "@/components/auth/sign-out-button";

export function AdminAccessDenied() {
  return <main className="flex min-h-screen items-center justify-center px-5 py-16 sm:px-8">
    <section className="w-full max-w-xl rounded-[1.75rem] border border-border bg-surface p-8 shadow-[0_28px_80px_-48px_rgba(15,30,54,0.35)] sm:p-11">
      <p className="text-[11px] font-bold tracking-[0.18em] text-accent-foreground">ADMIN ACCESS</p>
      <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-foreground">Admin access unavailable</h1>
      <p className="mt-4 text-sm leading-7 text-foreground-secondary">This signed-in account cannot open the administrator workspace. Sign out, then sign in with an authorized Google account if you need administrator access.</p>
      <div className="mt-7 flex flex-col gap-3 sm:flex-row">
        <Link href="/" className="mt-button mt-button-primary min-h-12 px-6 text-sm font-semibold">Go to Home</Link>
        <SignOutButton compact redirectTo="/admin/login" />
      </div>
    </section>
  </main>;
}
