"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, LoaderCircle, LogOut } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { invokeGoogleSignIn, invokeSignOut, resolveLoginCallbackURL, resolveLoginViewState } from "@/lib/auth/client-actions";

type LoginPanelProps = { intent?: "customer" | "admin" };

const sessionCheckTimeoutMs = 10_000;

export default function LoginPanel({ intent = "customer" }: LoginPanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackURL = resolveLoginCallbackURL(searchParams.get("next"), intent);
  const { data: session, isPending, error: sessionError, refetch } = authClient.useSession();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [sessionCheckExpired, setSessionCheckExpired] = useState(false);
  const [sessionRetryCount, setSessionRetryCount] = useState(0);
  const actionLock = useRef(false);

  useEffect(() => {
    if (!isPending) return;
    const timeout = window.setTimeout(() => setSessionCheckExpired(true), sessionCheckTimeoutMs);
    return () => window.clearTimeout(timeout);
  }, [isPending, sessionRetryCount]);

  const providerFailed = searchParams.get("authError") === "google";
  const viewState = resolveLoginViewState({
    isPending: isPending && !sessionCheckExpired,
    hasError: Boolean(sessionError) || (sessionCheckExpired && isPending),
    hasSession: Boolean(session?.user),
  });

  async function handleRetrySessionCheck() {
    if (actionLock.current) return;
    actionLock.current = true;
    setSessionCheckExpired(false);
    setSessionRetryCount((count) => count + 1);
    try {
      await refetch();
    } catch {
      setSessionCheckExpired(true);
    } finally {
      actionLock.current = false;
    }
  }

  async function handleGoogleSignIn() {
    if (actionLock.current || viewState !== "anonymous") return;
    actionLock.current = true;
    setIsSigningIn(true);
    setActionError(null);

    try {
      const started = await invokeGoogleSignIn((options) => authClient.signIn.social(options), callbackURL);
      if (!started) setActionError("Sign in could not be completed. Please try again.");
    } catch {
      setActionError("Sign in could not be completed. Please try again.");
    } finally {
      actionLock.current = false;
      setIsSigningIn(false);
    }
  }

  async function handleSignOut() {
    if (actionLock.current) return;
    actionLock.current = true;
    setIsSigningOut(true);
    setActionError(null);

    try {
      const signedOut = await invokeSignOut(() => authClient.signOut());
      if (!signedOut) {
        setActionError("Could not sign out. Try again.");
        return;
      }
      await refetch();
      router.replace("/");
      router.refresh();
    } catch {
      setActionError("Could not sign out. Try again.");
    } finally {
      actionLock.current = false;
      setIsSigningOut(false);
    }
  }

  const displayedError = actionError ?? (providerFailed ? "Sign in could not be completed. Please try again." : null);

  if (viewState === "loading") {
    return (
      <div className="flex min-h-14 items-center justify-center gap-2 rounded-xl border border-border bg-surface text-sm text-foreground-secondary" role="status">
        <LoaderCircle size={17} className="animate-spin" aria-hidden="true" />
        Checking session…
      </div>
    );
  }

  if (viewState === "authenticated" && session?.user) {
    return (
      <div className="space-y-4">
        <p className="rounded-xl border border-border bg-surface px-4 py-3 text-sm leading-6 text-foreground-secondary" role="status">
          {intent === "admin"
            ? "You are signed in. Admin access is verified on the server; this page cannot change account roles."
            : `You are signed in as ${session.user.name ?? session.user.email}. Signing in does not add a purchase to your account.`}
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href={callbackURL} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-[#0f1e36] transition-colors hover:bg-accent-hover">
            {callbackURL === "/admin" ? "Check admin access" : callbackURL === "/checkout" ? "Continue to checkout" : "Continue to homepage"} <ArrowRight size={16} aria-hidden="true" />
          </Link>
          <button type="button" onClick={handleSignOut} disabled={isSigningOut} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-border bg-surface px-5 text-sm font-semibold text-foreground transition-colors hover:bg-surface-secondary disabled:cursor-wait disabled:opacity-60">
            {isSigningOut ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : <LogOut size={16} aria-hidden="true" />}
            Sign out
          </button>
        </div>
        {displayedError && <p className="text-sm text-red-700 dark:text-red-300" role="alert">{displayedError}</p>}
      </div>
    );
  }

  const serviceUnavailable = viewState === "unavailable";

  return (
    <div className="space-y-4">
      {serviceUnavailable && <>
        <p className="rounded-xl border border-border bg-surface px-4 py-3 text-sm leading-6 text-foreground-secondary" role="status">Sign in is temporarily unavailable. Please try again later.</p>
        <button type="button" onClick={handleRetrySessionCheck} className="min-h-11 rounded-full px-4 text-sm font-semibold text-foreground underline decoration-border underline-offset-4 hover:text-foreground-secondary focus-visible:outline-2 focus-visible:outline-accent">Check session again</button>
      </>}
      <button type="button" onClick={handleGoogleSignIn} disabled={serviceUnavailable || isSigningIn} className="group inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-full bg-accent px-6 text-sm font-semibold text-[#0f1e36] shadow-[0_10px_24px_-14px_var(--accent)] transition-all hover:-translate-y-0.5 hover:bg-accent-hover hover:shadow-[0_14px_30px_-13px_var(--accent)] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60">
        {isSigningIn ? <LoaderCircle size={18} className="animate-spin" aria-hidden="true" /> : <span className="flex size-6 items-center justify-center rounded-full bg-white text-sm font-bold text-[#4285f4]" aria-hidden="true">G</span>}
        {isSigningIn ? "Opening Google sign in…" : "Continue with Google"}
        {!isSigningIn && <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" aria-hidden="true" />}
      </button>
      {displayedError && <p className="text-sm text-red-700 dark:text-red-300" role="alert">{displayedError}</p>}
    </div>
  );
}
