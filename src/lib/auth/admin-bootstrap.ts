import "server-only";

import { AuthorizationError, ConflictError, NotFoundError, ValidationError } from "../errors/app-error";
import type { User } from "../db/models/user";
import { getAllowedAdminEmails, isVerifiedOwnerGoogleIdentity, normalizeIdentityEmail, type GoogleAccountIdentity } from "./google-identity";

export interface AdminBootstrapStore {
  getAuthIdentity(authUserId: string): Promise<GoogleAccountIdentity | null>;
  findProfile(authUserId: string): Promise<User | null>;
  promoteActiveProfileAndAudit(authUserId: string): Promise<{ profile: User; promoted: boolean } | null>;
}

export interface BootstrapAdminInput {
  authUserId: string;
  confirmed: boolean;
}

export interface BootstrapAdminResult {
  profile: User;
  promoted: boolean;
}

export function createAdminBootstrap(store: AdminBootstrapStore, allowedEmails?: ReadonlySet<string>) {
  return async function bootstrapAdmin(input: BootstrapAdminInput): Promise<BootstrapAdminResult> {
    const authUserId = input.authUserId.trim();
    if (!input.confirmed || !authUserId || authUserId.length > 128 || authUserId !== input.authUserId) {
      throw new ValidationError([{ field: "confirmation", message: "Admin setup requires the exact user ID and explicit confirmation." }]);
    }

    const identity = await store.getAuthIdentity(authUserId);
    if (!identity) throw new NotFoundError();
    if (!isVerifiedOwnerGoogleIdentity(identity, allowedEmails ?? getAllowedAdminEmails())) throw new AuthorizationError();

    const profile = await store.findProfile(authUserId);
    if (!profile || profile.authUserId !== authUserId) throw new NotFoundError();
    if (profile.status !== "active") throw new AuthorizationError();
    if (normalizeIdentityEmail(profile.emailNormalized) !== normalizeIdentityEmail(identity.email)) throw new AuthorizationError();
    if (profile.role === "admin") return { profile, promoted: false };
    if (profile.role !== "customer") throw new AuthorizationError();

    const result = await store.promoteActiveProfileAndAudit(authUserId);
    if (!result) throw new ConflictError();
    return result;
  };
}
