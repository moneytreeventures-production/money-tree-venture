import "server-only";

import type { ServerEnv } from "../../env/schema";
import { getServerEnv } from "../../env/server";
import { IntegrationConfigurationError } from "../../errors/app-error";

export const CASHFREE_BASE_URLS = {
  sandbox: "https://sandbox.cashfree.com/pg",
  production: "https://api.cashfree.com/pg",
} as const;

export interface CashfreeConfiguration {
  environment: "sandbox" | "production";
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  apiVersion: string;
  webhookVersion: string;
  returnUrlBase: string;
}

const CASHFREE_KEYS = [
  "CASHFREE_CLIENT_ID",
  "CASHFREE_CLIENT_SECRET",
  "CASHFREE_ENVIRONMENT",
  "CASHFREE_API_VERSION",
  "CASHFREE_WEBHOOK_VERSION",
  "CASHFREE_RETURN_URL_BASE",
] as const;

function validateReturnUrl(value: string, env: ServerEnv): boolean {
  try {
    const url = new URL(value);
    if (url.username || url.password || url.hash || url.search) return false;
    if (env.NODE_ENV === "production") return url.protocol === "https:";
    return url.protocol === "https:" ||
      (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  } catch {
    return false;
  }
}

export function resolveCashfreeConfiguration(env: ServerEnv): CashfreeConfiguration {
  const missing = CASHFREE_KEYS.filter((key) => !env[key]);
  if (missing.length > 0) throw new IntegrationConfigurationError("Cashfree", missing);

  const returnUrlBase = env.CASHFREE_RETURN_URL_BASE!;
  if (!validateReturnUrl(returnUrlBase, env)) {
    throw new IntegrationConfigurationError("Cashfree", ["CASHFREE_RETURN_URL_BASE"]);
  }

  return {
    environment: env.CASHFREE_ENVIRONMENT!,
    baseUrl: CASHFREE_BASE_URLS[env.CASHFREE_ENVIRONMENT!],
    clientId: env.CASHFREE_CLIENT_ID!,
    clientSecret: env.CASHFREE_CLIENT_SECRET!,
    apiVersion: env.CASHFREE_API_VERSION!,
    webhookVersion: env.CASHFREE_WEBHOOK_VERSION!,
    returnUrlBase,
  };
}

export function getCashfreeConfiguration(): CashfreeConfiguration {
  return resolveCashfreeConfiguration(getServerEnv());
}

/** Return a public webhook callback only for HTTPS sites; localhost cannot receive Cashfree callbacks. */
export function cashfreeWebhookUrlFromReturnUrl(returnUrlBase: string): string | undefined {
  try {
    const url = new URL(returnUrlBase);
    return url.protocol === "https:" ? new URL("/api/webhooks/cashfree", url).toString() : undefined;
  } catch {
    return undefined;
  }
}

/** Preserve configured return parameters while replacing, never duplicating, the provider order ID. */
export function cashfreeReturnUrlFromBase(returnUrlBase: string, cashfreeOrderId: string): string {
  const url = new URL(returnUrlBase);
  url.searchParams.set("order_id", cashfreeOrderId);
  return url.toString();
}
