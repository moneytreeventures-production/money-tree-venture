import "server-only";

import mongoose, { Types } from "mongoose";
import { DatabaseError } from "../errors/app-error";

export const OWNER_ADMIN_EMAIL = "moneytreeventuress@gmail.com";

export interface GoogleAccountIdentity {
  email: string;
  emailVerified: boolean;
  active: boolean;
  providerIds: string[];
}

export function normalizeIdentityEmail(email: unknown): string {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

export function isVerifiedOwnerGoogleIdentity(identity: GoogleAccountIdentity | null | undefined): boolean {
  return Boolean(
    identity &&
      identity.active === true &&
      identity.emailVerified === true &&
      typeof identity.email === "string" &&
      normalizeIdentityEmail(identity.email) === OWNER_ADMIN_EMAIL &&
      Array.isArray(identity.providerIds) &&
      identity.providerIds.length === 1 &&
      identity.providerIds[0] === "google",
  );
}

/** Read the Better Auth user and its linked provider records from server-side Mongo collections. */
export async function readGoogleAccountIdentity(
  authUserId: string,
  session?: mongoose.mongo.ClientSession,
): Promise<GoogleAccountIdentity | null> {
  if (!/^[a-f\d]{24}$/i.test(authUserId)) return null;

  const db = mongoose.connection.db;
  if (!db) throw new DatabaseError();

  try {
    const objectId = new Types.ObjectId(authUserId);
    const readUser = () => db.collection("authUsers").findOne(
        { _id: objectId },
        { projection: { email: 1, emailVerified: 1, banned: 1, deletedAt: 1 }, session },
      );
    const readAccounts = () => db.collection("authAccounts")
        .find({ userId: objectId }, { projection: { providerId: 1 }, session })
        .toArray();
    let user: Awaited<ReturnType<typeof readUser>>;
    let accounts: Awaited<ReturnType<typeof readAccounts>>;
    if (session) {
      // MongoDB does not support parallel operations within a transaction.
      user = await readUser();
      accounts = await readAccounts();
    } else {
      [user, accounts] = await Promise.all([readUser(), readAccounts()]);
    }

    if (!user || typeof user.email !== "string") return null;

    return {
      email: user.email,
      emailVerified: user.emailVerified === true,
      active: user.banned !== true && user.deletedAt == null,
      providerIds: accounts.map((account) => typeof account.providerId === "string" ? account.providerId : ""),
    };
  } catch (error) {
    if (error instanceof DatabaseError) throw error;
    throw new DatabaseError(error);
  }
}
