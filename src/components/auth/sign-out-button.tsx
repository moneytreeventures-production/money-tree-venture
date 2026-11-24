"use client";

import { useRef, useState } from "react";
import { LoaderCircle, LogOut } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { invokeSignOut } from "@/lib/auth/client-actions";

interface SignOutButtonProps {
  redirectTo?: "/" | "/login";
  compact?: boolean;
}

export function SignOutButton({ redirectTo = "/", compact = false }: SignOutButtonProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locked = useRef(false);

  async function handleSignOut() {
    if (locked.current) return;
    locked.current = true;
    setPending(true);
    setError(null);

    const signedOut = await invokeSignOut(() => authClient.signOut());
    if (!signedOut) {
      setError("Could not sign out. Try again.");
      locked.current = false;
      setPending(false);
      return;
    }

    // A full navigation clears the App Router's in-memory authenticated route cache.
    window.location.replace(redirectTo);
  }

  return (
    <div className={compact ? "flex flex-col items-end gap-1" : "space-y-2"}>
      <button
        type="button"
        onClick={handleSignOut}
        disabled={pending}
        aria-busy={pending}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-border bg-surface px-4 text-sm font-semibold text-foreground transition-colors hover:bg-surface-secondary focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-wait disabled:opacity-60"
      >
        {pending ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : <LogOut size={16} aria-hidden="true" />}
        {pending ? "Sign out" + "…" : "Sign out"}
      </button>
      {error && <p className="max-w-56 text-right text-xs text-red-700 dark:text-red-300" role="alert">{error}</p>}
    </div>
  );
}
