import "server-only";

import { getServerEnv } from "../env/server";
import { IntegrationConfigurationError } from "../errors/app-error";

export interface PublicMediaConfiguration {
  accountId: string;
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  stagingBucket: string;
  publicBucket: string;
  baseUrl: string;
  uploadUrlTtlSeconds: number;
  maxImageBytes: number;
  maxVideoBytes: number;
  production: boolean;
}

export function resolvePublicMediaConfiguration(env: ReturnType<typeof getServerEnv>): PublicMediaConfiguration {
  const required = ["R2_ACCOUNT_ID", "R2_ENDPOINT", "R2_PUBLIC_MEDIA_ACCESS_KEY_ID", "R2_PUBLIC_MEDIA_SECRET_ACCESS_KEY", "R2_PUBLIC_MEDIA_STAGING_BUCKET_NAME", "R2_PUBLIC_MEDIA_BUCKET_NAME", "PUBLIC_MEDIA_BASE_URL"] as const;
  const missing = required.filter((key) => !env[key]);
  if (missing.length) throw new IntegrationConfigurationError("Public product media", missing);
  const accountId = env.R2_ACCOUNT_ID!;
  const endpointUrl = new URL(env.R2_ENDPOINT!);
  const baseUrl = new URL(env.PUBLIC_MEDIA_BASE_URL!);
  const stagingBucket = env.R2_PUBLIC_MEDIA_STAGING_BUCKET_NAME!;
  const publicBucket = env.R2_PUBLIC_MEDIA_BUCKET_NAME!;
  if (!/^[a-f0-9]{32}$/.test(accountId) || endpointUrl.protocol !== "https:" || endpointUrl.hostname !== `${accountId}.r2.cloudflarestorage.com` || endpointUrl.pathname !== "/" || endpointUrl.search || endpointUrl.hash) {
    throw new IntegrationConfigurationError("Public product media", ["R2_ACCOUNT_ID", "R2_ENDPOINT"]);
  }
  if (baseUrl.protocol !== "https:" || baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash || baseUrl.pathname !== "/" || (env.NODE_ENV === "production" && baseUrl.hostname.endsWith(".r2.dev"))) {
    throw new IntegrationConfigurationError("Public product media", ["PUBLIC_MEDIA_BASE_URL"]);
  }
  if (stagingBucket === publicBucket || publicBucket === env.R2_BUCKET_NAME || stagingBucket === env.R2_BUCKET_NAME) {
    throw new IntegrationConfigurationError("Public product media", ["R2_PUBLIC_MEDIA_BUCKET_NAME", "R2_PUBLIC_MEDIA_STAGING_BUCKET_NAME"]);
  }
  return {
    accountId,
    endpoint: endpointUrl.origin,
    region: env.R2_REGION,
    accessKeyId: env.R2_PUBLIC_MEDIA_ACCESS_KEY_ID!,
    secretAccessKey: env.R2_PUBLIC_MEDIA_SECRET_ACCESS_KEY!,
    stagingBucket,
    publicBucket,
    baseUrl: baseUrl.origin,
    uploadUrlTtlSeconds: env.PUBLIC_MEDIA_UPLOAD_URL_TTL_SECONDS,
    maxImageBytes: env.R2_PUBLIC_MEDIA_MAX_IMAGE_BYTES,
    maxVideoBytes: env.R2_PUBLIC_MEDIA_MAX_VIDEO_BYTES,
    production: env.NODE_ENV === "production",
  };
}

export function getPublicMediaConfiguration(): PublicMediaConfiguration {
  return resolvePublicMediaConfiguration(getServerEnv());
}
