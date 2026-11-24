import "server-only";

import { AuthorizationError, AuthenticationError } from "../errors/app-error";
import type { User } from "../db/models/user";
import { getCurrentApplicationProfile, getCurrentSession } from "./session";
import { isVerifiedOwnerGoogleIdentity, normalizeIdentityEmail, readGoogleAccountIdentity } from "./google-identity";

export interface AdminAuthorizationContext {
  session: { userId: string; email: string; emailVerified: boolean } | null;
  profile: User | null;
  googleIdentity: Awaited<ReturnType<typeof readGoogleAccountIdentity>>;
}

export function isAuthorizedOwnerAdmin(context: AdminAuthorizationContext): context is AdminAuthorizationContext & { profile: User; session: NonNullable<AdminAuthorizationContext["session"]> } {
  const { session, profile, googleIdentity } = context;
  if (!session || !profile || !googleIdentity || !session.emailVerified || !isVerifiedOwnerGoogleIdentity(googleIdentity)) return false;

  const trustedEmail = normalizeIdentityEmail(googleIdentity.email);
  return session.userId === profile.authUserId &&
    normalizeIdentityEmail(session.email) === trustedEmail &&
    profile.emailNormalized === trustedEmail &&
    profile.role === "admin" &&
    profile.status === "active";
}

export interface AdminAuthorizationUtilities {
  getCurrentAdmin(): Promise<User | null>;
  requireAdmin(): Promise<User>;
}

export function classifyAdminAccessError(error: unknown): "authentication" | "authorization" | "unexpected" {
  if (error instanceof AuthenticationError) return "authentication";
  if (error instanceof AuthorizationError) return "authorization";
  return "unexpected";
}

export async function resolveAdminRouteAccess(
  authorize: () => Promise<User>,
): Promise<"allowed" | "authentication" | "authorization"> {
  try {
    await authorize();
    return "allowed";
  } catch (error) {
    const outcome = classifyAdminAccessError(error);
    if (outcome === "authentication" || outcome === "authorization") return outcome;
    throw error;
  }
}

/** Authorization uses only the active application profile tied to the verified session. */
export function createAdminAuthorizationUtilities(
  readContext: () => Promise<AdminAuthorizationContext>,
): AdminAuthorizationUtilities {
  async function getCurrentAdmin(): Promise<User | null> {
    const context = await readContext();
    return isAuthorizedOwnerAdmin(context) ? context.profile : null;
  }

  async function requireAdmin(): Promise<User> {
    const context = await readContext();
    if (!context.session) throw new AuthenticationError();
    if (!isAuthorizedOwnerAdmin(context)) throw new AuthorizationError();
    return context.profile;
  }

  return { getCurrentAdmin, requireAdmin };
}

async function readCurrentAdminAuthorizationContext(): Promise<AdminAuthorizationContext> {
  const session = await getCurrentSession();
  if (!session) return { session: null, profile: null, googleIdentity: null };

  const [profile, googleIdentity] = await Promise.all([
    getCurrentApplicationProfile(),
    readGoogleAccountIdentity(session.user.id),
  ]);

  return {
    session: {
      userId: session.user.id,
      email: session.user.email,
      emailVerified: session.user.emailVerified,
    },
    profile,
    googleIdentity,
  };
}

const adminAuthorization = createAdminAuthorizationUtilities(readCurrentAdminAuthorizationContext);

export const getCurrentAdmin = adminAuthorization.getCurrentAdmin;
export const requireAdmin = adminAuthorization.requireAdmin;
