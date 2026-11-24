"use client";

export type GoogleSignInOptions = {
  provider: "google";
  callbackURL: string;
  errorCallbackURL: string;
};

export type LoginCallbackURL = "/" | "/checkout" | "/admin";

type ResultWithError = { error?: unknown | null };

export function resolveLoginViewState(input: {
  isPending: boolean;
  hasError: boolean;
  hasSession: boolean;
}): "loading" | "unavailable" | "authenticated" | "anonymous" {
  if (input.isPending) return "loading";
  if (input.hasError) return "unavailable";
  if (input.hasSession) return "authenticated";
  return "anonymous";
}

/** Checkout is the only return path accepted from a query parameter. */
export function resolveLoginCallbackURL(value: string | null, intent: "customer" | "admin" = "customer"): LoginCallbackURL {
  if (intent === "admin") return "/admin";
  return value === "/checkout" ? "/checkout" : "/";
}

export async function invokeGoogleSignIn(
  signIn: (options: GoogleSignInOptions) => Promise<ResultWithError>,
  callbackURL: LoginCallbackURL = "/",
): Promise<boolean> {
  try {
    const result = await signIn({
      provider: "google",
      callbackURL,
      errorCallbackURL: callbackURL === "/admin"
        ? "/admin/login?authError=google"
        : callbackURL === "/checkout"
          ? "/login?authError=google&next=%2Fcheckout"
          : "/login?authError=google",
    });
    return !result.error;
  } catch {
    return false;
  }
}

export async function invokeSignOut(
  signOut: () => Promise<ResultWithError>,
): Promise<boolean> {
  try {
    const result = await signOut();
    return !result.error;
  } catch {
    return false;
  }
}
