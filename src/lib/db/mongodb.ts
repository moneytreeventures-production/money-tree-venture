import "server-only";

import mongoose, { type Connection } from "mongoose";
import { getServerEnv } from "../env/server";
import type { ServerEnv } from "../env/schema";
import { logger } from "../logger";
import { createConnectionManager, type ConnectionCache } from "./connection-manager";

type MongoConfig = {
  uri: string;
  dbName: string;
};

interface MongoCache extends ConnectionCache<Connection> {
  listenersInstalled: boolean;
  hasConnected: boolean;
  disconnected: boolean;
  failureLogged: boolean;
}

declare global {
  // Kept on globalThis so Next.js development module reloads reuse the same client.
  var __moneyTreeMongoCache: MongoCache | undefined;
}

const cache = (globalThis.__moneyTreeMongoCache ??= {
  connection: mongoose.connection,
  promise: undefined,
  listenersInstalled: false,
  hasConnected: false,
  disconnected: false,
  failureLogged: false,
});

export function classifyMongoFailure(error: unknown): { errorName: string; errorCode?: string | number; category: string } {
  const candidate = error as { name?: unknown; code?: unknown; codeName?: unknown; message?: unknown; cause?: unknown } | null;
  const cause = candidate?.cause as { name?: unknown; code?: unknown; codeName?: unknown; message?: unknown } | undefined;
  const name = typeof candidate?.name === "string" ? candidate.name : typeof cause?.name === "string" ? cause.name : "Error";
  const code = [candidate?.code, candidate?.codeName, cause?.code, cause?.codeName].find((item) => typeof item === "string" || typeof item === "number");
  const codeText = String(code ?? "");
  const message = `${String(candidate?.message ?? "")} ${String(cause?.message ?? "")}`.toLowerCase();
  const category = /auth|bad auth|authentication/.test(`${name} ${codeText} ${message}`) ? "authentication" :
    /tls|ssl|certificate/.test(`${name} ${codeText} ${message}`) ? "tls" :
    /srv|enotfound|eai_again/.test(`${name} ${codeText} ${message}`) ? "dns_srv" :
    /timeout|timed out|serverselection/.test(`${name} ${codeText} ${message}`) ? "server_selection_timeout" :
    /pool|waitqueue/.test(`${name} ${codeText} ${message}`) ? "pool_exhaustion" :
    /econn|network|socket|unreachable|not allowed|ip access/.test(`${name} ${codeText} ${message}`) ? "network_or_access" : "database_unavailable";
  const safeCode = typeof code === "number" ? code : typeof code === "string" && /^[A-Z][A-Z0-9_]{0,39}$/.test(code) ? code : undefined;
  return { errorName: /^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(name) ? name : "Error", ...(safeCode === undefined ? {} : { errorCode: safeCode }), category };
}

function log(event: string, level: "info" | "warn" | "error", error?: unknown, durationMs?: number): void {
  const safe = error === undefined ? {} : classifyMongoFailure(error);
  const fields = { event, ...safe, ...(durationMs === undefined ? {} : { durationMs }), connectionState: mongoose.connection.readyState };
  logger[level](event, fields);
}

function ensureLifecycleListeners(): void {
  if (cache.listenersInstalled) return;
  cache.listenersInstalled = true;

  mongoose.connection.on("connected", () => {
    const event = cache.hasConnected ? "mongodb.connection.reconnected" : "mongodb.connection.connected";
    cache.hasConnected = true;
    cache.disconnected = false;
    cache.failureLogged = false;
    log(event, "info");
  });

  mongoose.connection.on("disconnected", () => {
    if (cache.hasConnected && !cache.disconnected) {
      cache.disconnected = true;
      cache.failureLogged = true;
      log("mongodb.connection.disconnected", "warn");
    }
  });

  mongoose.connection.on("error", (error: unknown) => {
    if (!cache.hasConnected || cache.disconnected || cache.failureLogged) return;
    cache.failureLogged = true;
    log("mongodb.connection.error", "error", error instanceof Error ? error.name : "Error");
  });
}

export function requireMongoConfig(env: Pick<ServerEnv, "MONGODB_URI" | "MONGODB_DB_NAME">): MongoConfig {
  if (!env.MONGODB_URI || !env.MONGODB_DB_NAME) {
    throw new Error("MongoDB is not configured. Set both MONGODB_URI and MONGODB_DB_NAME before using database features.");
  }

  return { uri: env.MONGODB_URI, dbName: env.MONGODB_DB_NAME };
}

const connect = createConnectionManager<Connection, MongoConfig>(cache, async ({ uri, dbName }) => {
  cache.failureLogged = false;
  const startedAt = Date.now();
  try {
    await mongoose.connect(uri, {
      dbName,
      maxPoolSize: 5,
      minPoolSize: 0,
      autoIndex: false,
      serverSelectionTimeoutMS: 10_000,
      connectTimeoutMS: 10_000,
    });
    return mongoose.connection;
  } catch (error) {
    if (!cache.failureLogged) {
      cache.failureLogged = true;
      log("mongodb.connection.initial_failure", "error", error, Date.now() - startedAt);
    }
    // Never include the driver message because it can contain topology or URI details.
    throw new Error("Unable to connect to MongoDB. Check database availability, access credentials, and network access. Connection details are redacted.");
  }
});

/** Lazily connect from a Node.js server entry point and reuse the isolate's client. */
export async function connectToDatabase(): Promise<Connection> {
  if (process.env.NEXT_RUNTIME === "edge") {
    throw new Error("MongoDB access requires the Node.js runtime.");
  }

  const config = requireMongoConfig(getServerEnv());
  ensureLifecycleListeners();

  if (cache.hasConnected && cache.connection.readyState === 0) {
    throw new Error("MongoDB is reconnecting. Retry the database operation shortly.");
  }

  try {
    return await connect(config);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Unable to connect to MongoDB.")) throw error;
    throw new Error("Unable to connect to MongoDB. Check database availability, access credentials, and network access. Connection details are redacted.");
  }
}
