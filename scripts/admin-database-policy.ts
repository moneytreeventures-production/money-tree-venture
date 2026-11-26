const APPROVED_ADMIN_DATABASES = new Set(["moneytreeventures", "moneytreeventures_staging"]);

export class AdminDatabasePolicyError extends Error {}

export type AdminDatabaseTarget = {
  nodeEnv: string | undefined;
  confirmedDatabase: string;
  configuredDatabase: string | undefined;
  mongoUri: string | undefined;
};

export function assertNonProductionAdminEnvironment(nodeEnv: string | undefined): void {
  if (nodeEnv === "production") {
    throw new AdminDatabasePolicyError("Administrator CLI is disabled when NODE_ENV is production.");
  }
}

/** Validate the target before opening a MongoDB connection. Never include the URI in errors. */
export function assertApprovedAdminDatabase(target: AdminDatabaseTarget): void {
  assertNonProductionAdminEnvironment(target.nodeEnv);

  if (!APPROVED_ADMIN_DATABASES.has(target.confirmedDatabase)) {
    throw new AdminDatabasePolicyError("Administrator CLI permits only the confirmed development or staging database; no connection attempted.");
  }

  let uriDatabase: string;
  try {
    uriDatabase = decodeURIComponent(new URL(target.mongoUri ?? "").pathname.slice(1));
  } catch {
    throw new AdminDatabasePolicyError("Invalid MongoDB URI; no connection attempted.");
  }

  if (target.configuredDatabase !== target.confirmedDatabase ||
      (uriDatabase && uriDatabase !== target.confirmedDatabase)) {
    throw new AdminDatabasePolicyError("Confirmed database does not match MongoDB configuration; no connection attempted.");
  }
}
