import { loadEnvConfig } from "@next/env";
import mongoose from "mongoose";
import { connectToDatabase } from "../src/lib/db/mongodb";
import { UserModel, type User } from "../src/lib/db/models/user";
import { AuditLogModel } from "../src/lib/db/models/reliability";
import { createAdminBootstrap, type AdminBootstrapStore } from "../src/lib/auth/admin-bootstrap";
import { getAllowedAdminEmails, isVerifiedOwnerGoogleIdentity, normalizeIdentityEmail, readGoogleAccountIdentity } from "../src/lib/auth/google-identity";
import { AdminDatabasePolicyError, assertApprovedAdminDatabase, assertNonProductionAdminEnvironment } from "./admin-database-policy";

const CONFIRMATION_FLAG = "--confirm-promote-admin";
const NON_PRODUCTION_FLAG = "--confirm-non-production";

export class AdminBootstrapUsageError extends Error {}

export function assertNonProductionBootstrap(nodeEnv: string | undefined): void {
  try { assertNonProductionAdminEnvironment(nodeEnv); }
  catch { throw new AdminBootstrapUsageError("Admin bootstrap is disabled when NODE_ENV is production."); }
}

export function parseAdminBootstrapArgs(args: readonly string[]): { authUserId: string; confirmed: boolean; database: string } {
  if (args.length !== 6 || args[0] !== "--user-id" || args[2] !== "--confirm-database" || !/^[A-Za-z0-9_-]{1,64}$/.test(args[3] ?? "") || args[4] !== CONFIRMATION_FLAG || args[5] !== NON_PRODUCTION_FLAG) {
    throw new AdminBootstrapUsageError("Usage: npm run admin:bootstrap -- --user-id <BETTER_AUTH_USER_ID> --confirm-database <non-production-db> --confirm-promote-admin --confirm-non-production");
  }
  const authUserId = args[1];
  if (!/^[a-f0-9]{24}$/i.test(authUserId)) {
    throw new AdminBootstrapUsageError("A valid exact Better Auth user ID is required.");
  }
  return { authUserId, confirmed: true, database: args[3] };
}

function createMongoAdminBootstrapStore(): AdminBootstrapStore {
  return {
    async getAuthIdentity(authUserId) {
      if (!/^[a-f0-9]{24}$/i.test(authUserId)) return null;
      return await readGoogleAccountIdentity(authUserId);
    },
    async findProfile(authUserId) {
      return await UserModel.findOne({ authUserId }).lean().exec() as unknown as User | null;
    },
    async promoteActiveProfileAndAudit(authUserId) {
      const clientSession = mongoose.connection.getClient().startSession();
      let result: { profile: User; promoted: boolean } | null = null;
      try {
        await clientSession.withTransaction(async () => {
          result = null;
          const identity = await readGoogleAccountIdentity(authUserId, clientSession);
          if (!identity || !isVerifiedOwnerGoogleIdentity(identity, getAllowedAdminEmails())) return;

          const existing = await UserModel.findOne({ authUserId }).session(clientSession).lean().exec() as unknown as User | null;
          if (!existing || existing.status !== "active" ||
              normalizeIdentityEmail(existing.emailNormalized) !== normalizeIdentityEmail(identity.email)) return;
          if (existing.role === "admin") {
            result = { profile: existing, promoted: false };
            return;
          }
          if (existing.role !== "customer") return;

          const updated = await UserModel.findOneAndUpdate(
            { authUserId, role: "customer", status: "active" },
            { $set: { role: "admin" } },
            { new: true, runValidators: true, session: clientSession },
          ).lean().exec() as unknown as User | null;
          if (!updated) return;

          await AuditLogModel.create([{
            actorType: "system",
            action: "admin.bootstrap.promoted",
            targetType: "user",
            targetId: authUserId,
            changedFields: ["role"],
            reason: "Controlled first-administrator bootstrap.",
          }], { session: clientSession });
          result = { profile: updated, promoted: true };
        });
        return result;
      } finally {
        await clientSession.endSession();
      }
    },
  };
}

export async function runAdminBootstrap(args: readonly string[]): Promise<void> {
  const input = parseAdminBootstrapArgs(args);
  loadEnvConfig(process.cwd());
  assertApprovedAdminDatabase({
    nodeEnv: process.env.NODE_ENV,
    confirmedDatabase: input.database,
    configuredDatabase: process.env.MONGODB_DB_NAME,
    mongoUri: process.env.MONGODB_URI,
  });
  try {
    await connectToDatabase();
    if (mongoose.connection.name !== input.database) throw new AdminBootstrapUsageError("Connected database does not match confirmation.");
    const bootstrap = createAdminBootstrap(createMongoAdminBootstrapStore());
    const result = await bootstrap(input);
    if (result.promoted) console.info("Admin access granted and audit event recorded.");
    else console.info("The specified active profile already has admin access; no change was made.");
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  void runAdminBootstrap(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof AdminBootstrapUsageError || error instanceof AdminDatabasePolicyError
      ? error.message
      : "Admin bootstrap did not complete. Check database availability and the selected environment; internal details were not printed.");
    process.exitCode = 1;
  });
}
