import { loadEnvConfig } from "@next/env";
import mongoose from "mongoose";
import { connectToDatabase } from "../src/lib/db/mongodb";
import { UserModel } from "../src/lib/db/models/user";
import { AuditLogModel } from "../src/lib/db/models/reliability";
import { normalizeIdentityEmail, OWNER_ADMIN_EMAIL, readGoogleAccountIdentity } from "../src/lib/auth/google-identity";
import { assertApprovedAdminDatabase } from "./admin-database-policy";

export function parseAdminRevokeArgs(args: readonly string[]) {
  if (args.length !== 6 || args[0] !== "--user-id" || !/^[a-f0-9]{24}$/i.test(args[1] ?? "") ||
      args[2] !== "--confirm-database" || !/^[A-Za-z0-9_-]{1,64}$/.test(args[3] ?? "") ||
      args[4] !== "--confirm-revoke-admin" || args[5] !== "--confirm-non-production") {
    throw new Error("Usage: npm run admin:revoke -- --user-id <BETTER_AUTH_USER_ID> --confirm-database <non-production-db> --confirm-revoke-admin --confirm-non-production");
  }
  return { authUserId: args[1], database: args[3] };
}

export async function runAdminRevocation(args: readonly string[]) {
  const input = parseAdminRevokeArgs(args);
  loadEnvConfig(process.cwd());
  assertApprovedAdminDatabase({
    nodeEnv: process.env.NODE_ENV,
    confirmedDatabase: input.database,
    configuredDatabase: process.env.MONGODB_DB_NAME,
    mongoUri: process.env.MONGODB_URI,
  });
  try {
    await connectToDatabase();
    if (mongoose.connection.name !== input.database) throw new Error("Connected database does not match confirmation.");
    const session = mongoose.connection.getClient().startSession();
    try {
      await session.withTransaction(async () => {
        const profile = await UserModel.findOne({ authUserId: input.authUserId }).session(session).lean().exec();
        const identity = await readGoogleAccountIdentity(input.authUserId, session);
        if (!profile || !identity || [profile.email, profile.emailNormalized, identity.email].some((email) => normalizeIdentityEmail(email) === OWNER_ADMIN_EMAIL)) throw new Error("Owner or unknown administrator cannot be revoked by this command.");
        if (profile.role !== "admin") return;
        const result = await UserModel.updateOne({ authUserId: input.authUserId, role: "admin" }, { $set: { role: "customer" } }, { session, runValidators: true });
        if (result.modifiedCount !== 1) throw new Error("Administrator role changed concurrently.");
        await AuditLogModel.create([{ actorType: "system", action: "admin.access.revoked", targetType: "user", targetId: input.authUserId, changedFields: ["role"], reason: "Explicit administrator revocation command." }], { session });
      });
    } finally { await session.endSession(); }
    console.info("Additional administrator access revoked or already absent.");
  } finally { await mongoose.disconnect(); }
}

if (require.main === module) void runAdminRevocation(process.argv.slice(2)).catch(() => {
  console.error("Administrator revocation did not complete; no details or credentials were printed.");
  process.exitCode = 1;
});
