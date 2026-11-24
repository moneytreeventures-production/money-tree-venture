import "server-only";

import { betterAuth } from "better-auth/minimal";
import type { BetterAuthOptions } from "better-auth/minimal";
import { getServerEnv } from "../env/server";
import { connectToDatabase } from "../db/mongodb";
import { IntegrationConfigurationError } from "../errors/app-error";
import { createBetterAuthOptions, resolveBetterAuthConfiguration } from "./config";

type AuthInstance = ReturnType<typeof betterAuth<BetterAuthOptions>>;

interface LazyAuthCache<T> {
  promise?: Promise<T>;
}

export function createLazyAuth<T>(
  initialize: () => Promise<T>,
  cache: LazyAuthCache<T> = {},
): () => Promise<T> {
  return async () => {
    let pending = cache.promise;
    if (!pending) {
      pending = Promise.resolve().then(initialize);
      cache.promise = pending;
    }

    try {
      return await pending;
    } catch (error) {
      if (cache.promise === pending) cache.promise = undefined;
      throw error;
    }
  };
}

async function initializeAuth(): Promise<AuthInstance> {
  const env = getServerEnv();
  const configuration = resolveBetterAuthConfiguration(env);
  if (!env.MONGODB_URI || !env.MONGODB_DB_NAME) {
    throw new IntegrationConfigurationError("MongoDB", ["MONGODB_URI", "MONGODB_DB_NAME"]);
  }
  const connection = await connectToDatabase();
  if (!connection.db) throw new Error("MongoDB connection is not ready for Better Auth.");

  return betterAuth(createBetterAuthOptions(
    configuration,
    connection.db,
    connection.getClient(),
  ));
}

declare global {
  // Reuse the auth instance during Next.js development reloads and warm runtimes.
  var __moneyTreeAuthPromise: Promise<AuthInstance> | undefined;
}

const authCache: LazyAuthCache<AuthInstance> = {
  get promise() { return globalThis.__moneyTreeAuthPromise; },
  set promise(value) { globalThis.__moneyTreeAuthPromise = value; },
};

/** Auth configuration and database initialization occur only when auth is used. */
export const getAuth = createLazyAuth(initializeAuth, authCache);
