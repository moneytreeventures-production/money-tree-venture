import "server-only";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NotFoundError, ProviderCommunicationError } from "../../errors/app-error";
import { createLogger } from "../../logger";
import { getR2Configuration, type R2Configuration } from "../config";
import { assertSafeObjectKey, assertSafePdfFileName, validatePdfUpload, validateSignedUrlExpiry } from "../validation";
import type { PrivatePdfStorage, SignedDownloadInput, StoredObjectMetadata, UploadPdfInput } from "../types";

interface R2Transport {
  send(command: unknown): Promise<unknown>;
  presign(command: unknown, expiresInSeconds: number): Promise<string>;
}

export interface R2StorageDependencies {
  getConfiguration(): R2Configuration;
  createClient(configuration: R2Configuration): R2Transport;
  signDownload(client: R2Transport, command: unknown, expiresInSeconds: number): Promise<string>;
}

const logger = createLogger();

function getErrorName(error: unknown): string {
  return error instanceof Error ? error.name : "UnknownError";
}

function isNotFound(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { name?: unknown; Code?: unknown; $metadata?: { httpStatusCode?: unknown } };
  return value.$metadata?.httpStatusCode === 404 ||
    value.name === "NotFound" || value.name === "NoSuchKey" || value.Code === "NoSuchKey";
}

function mapProviderFailure(operation: string, error: unknown): ProviderCommunicationError {
  logger.error("Private R2 operation failed", {
    provider: "cloudflare-r2",
    operation,
    errorName: getErrorName(error),
  });
  const status = error && typeof error === "object"
    ? (error as { $metadata?: { httpStatusCode?: unknown } }).$metadata?.httpStatusCode
    : undefined;
  return new ProviderCommunicationError("Cloudflare R2", typeof status === "number" ? "rejected" : "network");
}

function validateUpload(input: UploadPdfInput, maxBytes: number): UploadPdfInput {
  return validatePdfUpload(input, maxBytes);
}

export function createR2Storage(dependencies: R2StorageDependencies): PrivatePdfStorage {
  let client: R2Transport | undefined;
  let configuration: R2Configuration | undefined;

  const getClient = (): { client: R2Transport; configuration: R2Configuration } => {
    if (!client) {
      configuration = dependencies.getConfiguration();
      client = dependencies.createClient(configuration);
    }
    return { client, configuration: configuration! };
  };

  return {
    async getPrivatePdf(objectKey) {
      assertSafeObjectKey(objectKey);
      const { client: r2, configuration: config } = getClient();
      try {
        const response = await r2.send(new GetObjectCommand({ Bucket: config.bucketName, Key: objectKey })) as {
          ContentLength?: number; ContentType?: string; Body?: { transformToByteArray?: () => Promise<Uint8Array> };
        };
        if (response.ContentLength !== undefined && (response.ContentLength < 1 || response.ContentLength > config.maxUploadBytes)) {
          throw new ProviderCommunicationError("Cloudflare R2", "rejected");
        }
        if (response.ContentType && response.ContentType !== "application/pdf") throw new ProviderCommunicationError("Cloudflare R2", "rejected");
        if (!response.Body?.transformToByteArray) throw new ProviderCommunicationError("Cloudflare R2", "rejected");
        const bytes = await response.Body.transformToByteArray();
        if (bytes.byteLength < 5 || bytes.byteLength > config.maxUploadBytes ||
          Buffer.from(bytes.subarray(0, 5)).toString("ascii") !== "%PDF-") {
          throw new ProviderCommunicationError("Cloudflare R2", "rejected");
        }
        return bytes;
      } catch (error) {
        if (isNotFound(error)) throw new NotFoundError();
        if (error instanceof ProviderCommunicationError) throw error;
        throw mapProviderFailure("get-private-pdf", error);
      }
    },

    async upload(input) {
      const { client: r2, configuration: config } = getClient();
      const safeInput = validateUpload(input, config.maxUploadBytes);
      try {
        await r2.send(new PutObjectCommand({
          Bucket: config.bucketName,
          Key: safeInput.objectKey,
          Body: safeInput.body,
          ContentLength: safeInput.body.byteLength,
          ContentType: "application/pdf",
          Metadata: safeInput.metadata,
        }));
      } catch (error) {
        throw mapProviderFailure("upload", error);
      }
    },

    async delete(objectKey) {
      assertSafeObjectKey(objectKey);
      const { client: r2, configuration: config } = getClient();
      try {
        await r2.send(new DeleteObjectCommand({ Bucket: config.bucketName, Key: objectKey }));
      } catch (error) {
        throw mapProviderFailure("delete", error);
      }
    },

    async exists(objectKey) {
      assertSafeObjectKey(objectKey);
      const { client: r2, configuration: config } = getClient();
      try {
        await r2.send(new HeadObjectCommand({ Bucket: config.bucketName, Key: objectKey }));
        return true;
      } catch (error) {
        if (isNotFound(error)) return false;
        throw mapProviderFailure("exists", error);
      }
    },

    async getMetadata(objectKey): Promise<StoredObjectMetadata | null> {
      assertSafeObjectKey(objectKey);
      const { client: r2, configuration: config } = getClient();
      try {
        const response = await r2.send(new HeadObjectCommand({ Bucket: config.bucketName, Key: objectKey })) as {
          ContentLength?: number; ContentType?: string; ETag?: string; LastModified?: Date;
          Metadata?: Record<string, string>;
        };
        return {
          objectKey,
          sizeBytes: response.ContentLength ?? 0,
          ...(response.ContentType ? { contentType: response.ContentType } : {}),
          ...(response.ETag ? { etag: response.ETag } : {}),
          ...(response.LastModified ? { lastModified: response.LastModified } : {}),
          metadata: response.Metadata ?? {},
        };
      } catch (error) {
        if (isNotFound(error)) return null;
        throw mapProviderFailure("get-metadata", error);
      }
    },

    async createSignedDownloadUrl(input: SignedDownloadInput) {
      assertSafeObjectKey(input.objectKey);
      const fileName = input.downloadFileName ? assertSafePdfFileName(input.downloadFileName) : undefined;
      const { client: r2, configuration: config } = getClient();
      const expiresInSeconds = validateSignedUrlExpiry(input.expiresInSeconds ?? config.downloadUrlTtlSeconds);
      try {
        await r2.send(new HeadObjectCommand({ Bucket: config.bucketName, Key: input.objectKey }));
        return await dependencies.signDownload(
          r2,
          new GetObjectCommand({
            Bucket: config.bucketName,
            Key: input.objectKey,
            ResponseContentType: "application/pdf",
              ResponseCacheControl: "private, no-store",
            ...(fileName ? { ResponseContentDisposition: `attachment; filename="${fileName.replace(/"/g, "")}"` } : {}),
          }),
          expiresInSeconds,
        );
      } catch (error) {
        if (isNotFound(error)) throw new NotFoundError();
        throw mapProviderFailure("sign-download", error);
      }
    },
  };
}

export function getR2SdkClientOptions(configuration: R2Configuration) {
  return {
    endpoint: configuration.endpoint,
    region: configuration.region,
    forcePathStyle: true,
  } as const;
}

function createAwsClient(configuration: R2Configuration): R2Transport {
  const client = new S3Client({
    ...getR2SdkClientOptions(configuration),
    credentials: {
      accessKeyId: configuration.accessKeyId,
      secretAccessKey: configuration.secretAccessKey,
    },
  });
  return {
    send: (command) => client.send(command as never),
    presign: (command, expiresInSeconds) => getSignedUrl(client, command as never, { expiresIn: expiresInSeconds }),
  };
}

const awsDependencies: R2StorageDependencies = {
  getConfiguration: getR2Configuration,
  createClient: createAwsClient,
  signDownload: (client, command, expiresInSeconds) => client.presign(command, expiresInSeconds),
};

let defaultStorage: PrivatePdfStorage | undefined;

/** Importing this module does not read credentials or construct an SDK client. */
export function getR2Storage(): PrivatePdfStorage {
  defaultStorage ??= createR2Storage(awsDependencies);
  return defaultStorage;
}
