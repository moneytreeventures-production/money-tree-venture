import "server-only";

import { UserModel, type User } from "../db/models/user";
import { DatabaseError, InternalServerError } from "../errors/app-error";

export interface AuthenticatedIdentity {
  id: string;
  name: string;
  email: string;
}

interface CustomerProfileSeed {
  authUserId: string;
  name: string;
  email: string;
  emailNormalized: string;
  role: "customer";
  status: "active";
}

export interface CustomerProfileStore {
  ensureByAuthUserId(seed: CustomerProfileSeed): Promise<User | null>;
  findByAuthUserId(authUserId: string): Promise<User | null>;
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === "object" && error !== null &&
    "code" in error && (error.code === 11000 || error.code === "11000");
}

const mongooseProfileStore: CustomerProfileStore = {
  async ensureByAuthUserId(seed) {
    return await UserModel.findOneAndUpdate(
      { authUserId: seed.authUserId },
      { $setOnInsert: seed },
      { upsert: true, returnDocument: "after", runValidators: true, setDefaultsOnInsert: true },
    ).lean().exec() as unknown as User | null;
  },
  async findByAuthUserId(authUserId) {
    return await UserModel.findOne({ authUserId }).lean().exec() as unknown as User | null;
  },
};

/**
 * Create an application profile from a trusted Better Auth identity. The unique
 * authUserId index makes concurrent upserts converge; duplicate-key races are
 * recovered by loading the row using that same immutable identity only.
 */
export function createCustomerProfileProvisioner(store: CustomerProfileStore) {
  return async (identity: AuthenticatedIdentity): Promise<User> => {
    if (!identity.id || identity.id.trim() !== identity.id || identity.id.length > 128 ||
        !identity.name?.trim() || identity.name.trim().length > 120 ||
        !identity.email?.trim() || identity.email.trim().length > 320 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identity.email.trim())) {
      throw new InternalServerError();
    }

    const email = identity.email.trim().toLowerCase();
    const seed: CustomerProfileSeed = {
      authUserId: identity.id,
      name: identity.name.trim(),
      email,
      emailNormalized: email,
      role: "customer",
      status: "active",
    };

    let profile: User | null = null;
    try {
      profile = await store.ensureByAuthUserId(seed);
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw new DatabaseError(error);
    }

    if (!profile) {
      try {
        profile = await store.findByAuthUserId(identity.id);
      } catch (error) {
        throw new DatabaseError(error);
      }
    }

    if (!profile || profile.authUserId !== identity.id || !profile.name?.trim() ||
        !profile.email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email) ||
        profile.emailNormalized !== profile.email.trim().toLowerCase() ||
        !["customer", "admin"].includes(profile.role) ||
        !["active", "blocked", "deleted"].includes(profile.status)) {
      throw new DatabaseError();
    }
    return profile;
  };
}

export const provisionCustomerProfile = createCustomerProfileProvisioner(mongooseProfileStore);
