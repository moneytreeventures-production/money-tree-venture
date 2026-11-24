import "server-only";

import type { ServerEnv } from "../env/schema";
import { getServerEnv } from "../env/server";
import { IntegrationConfigurationError } from "../errors/app-error";

export interface R2Configuration {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  endpoint: string;
  region: string;
  maxUploadBytes: number;
  downloadUrlTtlSeconds: number;
}

const R2_KEYS = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
  "R2_ENDPOINT",
] as const;

export function resolveR2Configuration(env: ServerEnv): R2Configuration {
  const missing = R2_KEYS.filter((key) => !env[key]);
  if (missing.length > 0) throw new IntegrationConfigurationError("Cloudflare R2", missing);

  const accountId = env.R2_ACCOUNT_ID!;
  const endpoint = env.R2_ENDPOINT!;
  const endpointUrl = new URL(endpoint);
  if (!/^[a-f0-9]{32}$/.test(accountId) || endpointUrl.protocol !== "https:" ||
      endpointUrl.hostname !== `${accountId}.r2.cloudflarestorage.com` ||
      endpointUrl.pathname !== "/" || endpointUrl.search || endpointUrl.hash) {
    throw new IntegrationConfigurationError("Cloudflare R2", ["R2_ACCOUNT_ID", "R2_ENDPOINT"]);
  }

  const bucketName = env.R2_BUCKET_NAME!;
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucketName) || bucketName.includes("..")) {
    throw new IntegrationConfigurationError("Cloudflare R2", ["R2_BUCKET_NAME"]);
  }

  return {
    accountId,
    endpoint: endpointUrl.origin,
    accessKeyId: env.R2_ACCESS_KEY_ID!,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
    bucketName,
    region: env.R2_REGION,
    maxUploadBytes: env.R2_MAX_UPLOAD_BYTES,
    downloadUrlTtlSeconds: env.DOWNLOAD_URL_TTL_SECONDS,
  };
}

export function getR2Configuration(): R2Configuration {
  return resolveR2Configuration(getServerEnv());
}
