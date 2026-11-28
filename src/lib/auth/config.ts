import "server-only";

import { mongodbAdapter } from "@better-auth/mongo-adapter";
import type { BetterAuthOptions } from "better-auth/minimal";
import type { ServerEnv } from "../env/schema";
import { IntegrationConfigurationError } from "../errors/app-error";
import { logger as appLogger, type LogFields } from "../logger";
import { provisionCustomerProfile } from "./customer-profile";

export interface BetterAuthConfiguration {
  secret: string;
  googleClientId: string;
  googleClientSecret: string;
  baseURL: string;
  trustedOrigin: string;
  useSecureCookies: boolean;
}

export function resolveBetterAuthConfiguration(env: ServerEnv): BetterAuthConfiguration {
  const missing: string[] = [];
  if (!env.BETTER_AUTH_SECRET) missing.push("BETTER_AUTH_SECRET");
  if (!env.BETTER_AUTH_URL) missing.push("BETTER_AUTH_URL");
  if (!env.GOOGLE_CLIENT_ID) missing.push("GOOGLE_CLIENT_ID");
  if (!env.GOOGLE_CLIENT_SECRET) missing.push("GOOGLE_CLIENT_SECRET");
  if (missing.length) throw new IntegrationConfigurationError("Better Auth", missing);

  const base = new URL(env.BETTER_AUTH_URL!);
  const isLocalHttp = base.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname);
  if (base.username || base.password || base.search || base.hash || base.pathname !== "/" ||
      (env.NODE_ENV === "production" ? base.protocol !== "https:" : base.protocol !== "https:" && !isLocalHttp)) {
    throw new IntegrationConfigurationError("Better Auth", ["BETTER_AUTH_URL"]);
  }

  return {
    secret: env.BETTER_AUTH_SECRET!,
    googleClientId: env.GOOGLE_CLIENT_ID!,
    googleClientSecret: env.GOOGLE_CLIENT_SECRET!,
    baseURL: base.origin,
    trustedOrigin: base.origin,
    useSecureCookies: env.NODE_ENV === "production",
  };
}

type MongoDatabase = Parameters<typeof mongodbAdapter>[0];
type MongoClient = NonNullable<Parameters<typeof mongodbAdapter>[1]>["client"];
type SafeAuthLog = (level: "warn" | "error", message: string, fields: LogFields) => void;

export function createSafeBetterAuthLogger(write: SafeAuthLog = (level, message, fields) => appLogger[level](message, fields)) {
  return {
    level: "warn" as const,
    log(level: "debug" | "info" | "warn" | "error", _message: string, ...args: unknown[]) {
      if (level !== "warn" && level !== "error") return;
      const error = args.find((value): value is Error => value instanceof Error);
      write(level, "better-auth.internal", {
        provider: "better-auth",
        errorName: error?.name ?? "ProviderError",
      });
    },
  };
}

/**
 * Better Auth's own auth collections stay distinct from the application's
 * `users` profile/authorization collection.
 */
export function createBetterAuthOptions(
  configuration: BetterAuthConfiguration,
  db: MongoDatabase,
  client: MongoClient,
  provisionProfile: typeof provisionCustomerProfile = provisionCustomerProfile,
): BetterAuthOptions {
  return {
    appName: "Money Tree Venture",
    baseURL: configuration.baseURL,
    secret: configuration.secret,
    trustedOrigins: [configuration.trustedOrigin],
    database: mongodbAdapter(db, { client }),
    socialProviders: {
      google: {
        clientId: configuration.googleClientId,
        clientSecret: configuration.googleClientSecret,
        scope: ["openid", "email", "profile"],
      },
    },
    emailAndPassword: { enabled: false },
    user: { modelName: "authUsers" },
    session: { modelName: "authSessions" },
    account: { modelName: "authAccounts" },
    verification: { modelName: "authVerifications" },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            await provisionProfile({ id: user.id, name: user.name, email: user.email });
          },
        },
      },
    },
    logger: createSafeBetterAuthLogger(),
    advanced: {
      useSecureCookies: configuration.useSecureCookies,
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure: configuration.useSecureCookies,
      },
    },
  };
}
