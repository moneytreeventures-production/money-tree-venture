import "server-only";

import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import sharp from "sharp";
import { ProviderCommunicationError, ValidationError } from "../errors/app-error";
import { createLogger } from "../logger";
import { getPublicMediaConfiguration, type PublicMediaConfiguration } from "./public-media-config";

export type ProductMediaKind = "thumbnail" | "promotional_video";
export type ProductMediaType = "image/jpeg" | "image/png" | "image/webp" | "video/mp4" | "video/webm";

export interface PublicMediaStorage {
  createUploadUrl(input: { objectKey: string; contentType: ProductMediaType; expiresInSeconds?: number }): Promise<string>;
  validateAndPublish(input: { stagingKey: string; objectKey: string; kind: ProductMediaKind; contentType: ProductMediaType; expectedBytes: number; maximumBytes: number; publicUrlKey: string }): Promise<{ sizeBytes: number; publicUrl: string; width?: number; height?: number }>;
  deleteStagingObject(objectKey: string): Promise<void>;
  deletePublicObject(objectKey: string): Promise<void>;
}

interface MediaR2Transport { send(command: unknown): Promise<unknown>; presign(command: unknown, seconds: number): Promise<string> }
export interface PublicMediaDependencies {
  getConfiguration(): PublicMediaConfiguration;
  createClient(configuration: PublicMediaConfiguration): MediaR2Transport;
  signUpload(client: MediaR2Transport, command: unknown, seconds: number): Promise<string>;
}

const logger = createLogger();
const imageTypes: Record<string, { extension: string; type: ProductMediaType }> = {
  "image/jpeg": { extension: "jpg", type: "image/jpeg" },
  "image/png": { extension: "png", type: "image/png" },
  "image/webp": { extension: "webp", type: "image/webp" },
};
const videoTypes: Record<string, { extension: string; type: ProductMediaType }> = {
  "video/mp4": { extension: "mp4", type: "video/mp4" },
  "video/webm": { extension: "webm", type: "video/webm" },
};

export function validateProductMediaDescriptor(input: { kind: ProductMediaKind; fileName: string; contentType: string; sizeBytes: number }, configuration: PublicMediaConfiguration) {
  const allowed = input.kind === "thumbnail" ? imageTypes : videoTypes;
  const file = allowed[input.contentType];
  const extension = input.fileName.split(".").pop()?.toLowerCase();
  if (!file || extension !== file.extension || !/^[^/\\\u0000-\u001f\u007f]{1,180}$/.test(input.fileName) || input.fileName.startsWith(".") || input.fileName.includes("..")) {
    throw new ValidationError([{ field: "file", message: "Unsupported product media format or filename." }]);
  }
  const limit = input.kind === "thumbnail" ? configuration.maxImageBytes : configuration.maxVideoBytes;
  if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes < 1 || input.sizeBytes > limit) {
    throw new ValidationError([{ field: "file", message: "Product media file exceeds the configured size limit." }]);
  }
  return { contentType: file.type, extension: file.extension, maximumBytes: limit } as const;
}

function assertStagingKey(key: string): void {
  if (!/^pending\/[a-f0-9]{24}\/[0-9a-f-]{36}\.upload$/i.test(key)) throw new ValidationError([{ field: "mediaKey", message: "Media upload reference is invalid." }]);
}

function assertPublicKey(key: string): void {
  if (!/^products\/[a-f0-9]{24}\/[0-9a-f-]{36}\.(?:jpg|png|webp|mp4|webm)$/i.test(key)) throw new ValidationError([{ field: "mediaKey", message: "Media object reference is invalid." }]);
}

function isNotFound(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404));
}

function providerFailure(operation: string, error: unknown): ProviderCommunicationError {
  logger.error("Public product media storage operation failed", { provider: "cloudflare-r2-public-media", operation, errorName: error instanceof Error ? error.name : "UnknownError" });
  return new ProviderCommunicationError("Cloudflare R2", "network");
}

async function bodyBytes(result: unknown): Promise<Uint8Array> {
  const body = (result as { Body?: { transformToByteArray?: () => Promise<Uint8Array> } } | null)?.Body;
  if (!body?.transformToByteArray) throw new ProviderCommunicationError("Cloudflare R2", "rejected");
  return body.transformToByteArray();
}

export function createPublicMediaStorage(dependencies: PublicMediaDependencies): PublicMediaStorage {
  let client: MediaR2Transport | undefined;
  let config: PublicMediaConfiguration | undefined;
  const getClient = () => {
    config ??= dependencies.getConfiguration();
    client ??= dependencies.createClient(config);
    return { client, config };
  };

  return {
    async createUploadUrl(input) {
      assertStagingKey(input.objectKey);
      const { client: r2, config: current } = getClient();
      try {
        return await dependencies.signUpload(r2, new PutObjectCommand({ Bucket: current.stagingBucket, Key: input.objectKey, ContentType: input.contentType }), input.expiresInSeconds ?? current.uploadUrlTtlSeconds);
      } catch (error) { throw providerFailure("presign-upload", error); }
    },

    async validateAndPublish(input) {
      assertStagingKey(input.stagingKey);
      assertPublicKey(input.objectKey);
      const { client: r2, config: current } = getClient();
      let published = false;
      try {
        const head = await r2.send(new HeadObjectCommand({ Bucket: current.stagingBucket, Key: input.stagingKey })) as { ContentLength?: number; ContentType?: string };
        const sizeBytes = head.ContentLength ?? 0;
        if (sizeBytes < 1 || sizeBytes !== input.expectedBytes || sizeBytes > input.maximumBytes || head.ContentType !== input.contentType) throw new ValidationError([{ field: "file", message: "Uploaded media did not match its declared type or size." }]);
        const isImage = input.kind === "thumbnail";
        const object = await r2.send(new GetObjectCommand({ Bucket: current.stagingBucket, Key: input.stagingKey, ...(isImage ? {} : { Range: "bytes=0-63" }) }));
        const bytes = await bodyBytes(object);
        let dimensions: { width?: number; height?: number } = {};
        if (isImage) {
          if (bytes.byteLength !== sizeBytes) throw new ValidationError([{ field: "file", message: "Image data could not be fully verified." }]);
          try {
            const image = sharp(bytes, { failOn: "error", limitInputPixels: 80_000_000 });
            const metadata = await image.metadata();
            await image.stats();
            const expectedFormat = ({ "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp" } as const)[input.contentType as "image/jpeg" | "image/png" | "image/webp"];
            if (metadata.format !== expectedFormat || !metadata.width || !metadata.height || metadata.width > 12000 || metadata.height > 12000) throw new Error("invalid image metadata");
            dimensions = { width: metadata.width, height: metadata.height };
          } catch { throw new ValidationError([{ field: "file", message: "Image data is damaged or has unsupported dimensions." }]); }
        } else {
          const validMp4 = input.contentType === "video/mp4" && bytes.byteLength >= 12 && Buffer.from(bytes.subarray(4, 8)).toString("ascii") === "ftyp";
          const validWebm = input.contentType === "video/webm" && bytes.byteLength >= 4 && Buffer.from(bytes.subarray(0, 4)).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
          if (!validMp4 && !validWebm) throw new ValidationError([{ field: "file", message: "Video file signature does not match MP4 or WebM." }]);
        }
        await r2.send(new CopyObjectCommand({
          Bucket: current.publicBucket,
          Key: input.objectKey,
          CopySource: `${current.stagingBucket}/${input.stagingKey}`,
          ContentType: input.contentType,
          CacheControl: "public, max-age=31536000, immutable",
          MetadataDirective: "REPLACE",
          Metadata: { "public-media-id": input.publicUrlKey },
        }));
        published = true;
        const publicHead = await r2.send(new HeadObjectCommand({ Bucket: current.publicBucket, Key: input.objectKey })) as { ContentLength?: number; ContentType?: string };
        if (publicHead.ContentLength !== sizeBytes || publicHead.ContentType !== input.contentType) throw new ProviderCommunicationError("Cloudflare R2", "rejected");
        await r2.send(new DeleteObjectCommand({ Bucket: current.stagingBucket, Key: input.stagingKey }));
        return { sizeBytes, publicUrl: `${current.baseUrl}/${input.objectKey}`, ...dimensions };
      } catch (error) {
        if (published) await r2.send(new DeleteObjectCommand({ Bucket: current.publicBucket, Key: input.objectKey })).catch(() => undefined);
        if (error instanceof ValidationError || error instanceof ProviderCommunicationError) throw error;
        throw providerFailure("validate-and-publish", error);
      }
    },

    async deletePublicObject(objectKey) {
      assertPublicKey(objectKey);
      const { client: r2, config: current } = getClient();
      try { await r2.send(new DeleteObjectCommand({ Bucket: current.publicBucket, Key: objectKey })); }
      catch (error) { if (!isNotFound(error)) throw providerFailure("delete-public-media", error); }
    },

    async deleteStagingObject(objectKey) {
      assertStagingKey(objectKey);
      const { client: r2, config: current } = getClient();
      try { await r2.send(new DeleteObjectCommand({ Bucket: current.stagingBucket, Key: objectKey })); }
      catch (error) { if (!isNotFound(error)) throw providerFailure("delete-staging-media", error); }
    },
  };
}

export function getPublicMediaS3ClientOptions(configuration: PublicMediaConfiguration) {
  return { endpoint: configuration.endpoint, region: configuration.region, forcePathStyle: true as const, requestChecksumCalculation: "WHEN_REQUIRED" as const, credentials: { accessKeyId: configuration.accessKeyId, secretAccessKey: configuration.secretAccessKey } };
}

function createAwsClient(configuration: PublicMediaConfiguration): MediaR2Transport {
  // R2 presigned browser PUTs use Content-Type as their only required request
  // header. Suppress the SDK's optional CRC32 request checksum so it does not
  // add checksum query parameters that browser clients cannot reliably match.
  const client = new S3Client(getPublicMediaS3ClientOptions(configuration));
  return { send: (command) => client.send(command as never), presign: (command, seconds) => getSignedUrl(client, command as never, { expiresIn: seconds }) };
}

const defaultDependencies: PublicMediaDependencies = {
  getConfiguration: getPublicMediaConfiguration,
  createClient: createAwsClient,
  signUpload: (client, command, seconds) => client.presign(command, seconds),
};

let storage: PublicMediaStorage | undefined;
export function getPublicMediaStorage(): PublicMediaStorage { storage ??= createPublicMediaStorage(defaultDependencies); return storage; }
