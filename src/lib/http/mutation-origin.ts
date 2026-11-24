import { ApplicationError } from "../errors/app-error";

export function isTrustedMutationOrigin(request: Request, trustedUrl = process.env.BETTER_AUTH_URL): boolean {
  const origin = request.headers.get("origin");
  if (!origin || !trustedUrl || request.headers.get("sec-fetch-site") === "cross-site" || request.headers.get("sec-fetch-site") === "same-site") return false;
  try { return origin === new URL(trustedUrl).origin; } catch { return false; }
}

/** Reject browser cross-origin mutations before any authenticated write. */
export function assertMutationOrigin(request: Request, trustedUrl = process.env.BETTER_AUTH_URL): void {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  let trustedOrigin: string | undefined;
  try { if (trustedUrl) trustedOrigin = new URL(trustedUrl).origin; } catch { /* fail closed below */ }
  if (site === "cross-site" || site === "same-site" ||
    (origin && (!trustedOrigin || origin !== trustedOrigin)) ||
    (!origin && request.headers.has("cookie") && site !== "same-origin")) {
    throw new ApplicationError("This request must come from this site.", { code: "INVALID_ORIGIN", statusCode: 403 });
  }
}
