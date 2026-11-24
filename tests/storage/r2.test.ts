import assert from "node:assert/strict";
import { test } from "node:test";
import { PDFDocument } from "pdf-lib";
import { HeadObjectCommand, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { parseServerEnv } from "../../src/lib/env/schema";
import { IntegrationConfigurationError, NotFoundError, ProviderCommunicationError } from "../../src/lib/errors/app-error";
import { getR2Storage, createR2Storage, getR2SdkClientOptions } from "../../src/lib/storage/r2/client";
import { resolveR2Configuration } from "../../src/lib/storage/config";
import { assertReadablePdfDocument, assertSafeObjectKey, createPrivatePdfObjectKey, validatePdfUpload, validateSignedUrlExpiry } from "../../src/lib/storage/validation";
import type { R2Configuration } from "../../src/lib/storage/config";
import type { R2StorageDependencies } from "../../src/lib/storage/r2/client";

const accountId = "0123456789abcdef0123456789abcdef";
const validR2Env = {
  NODE_ENV: "test",
  R2_ACCOUNT_ID: accountId,
  R2_ENDPOINT: `https://${accountId}.r2.cloudflarestorage.com`,
  R2_REGION: "auto",
  R2_ACCESS_KEY_ID: "test-access-key",
  R2_SECRET_ACCESS_KEY: "test-secret-key",
  R2_BUCKET_NAME: "moneytree-private-test",
};

const configuration: R2Configuration = resolveR2Configuration(parseServerEnv(validR2Env));
const validPdf = {
  objectKey: "masters/asset-123/versions/550e8400-e29b-41d4-a716-446655440000.pdf",
  body: new TextEncoder().encode("%PDF-1.7\nmock pdf"),
  originalFileName: "guide.pdf",
  contentType: "application/pdf" as const,
  metadata: { assetId: "asset-123", productId: "product-123", version: "version_1" },
};

function fakeDependencies(overrides: Partial<R2StorageDependencies> = {}) {
  const commands: unknown[] = [];
  let createCount = 0;
  let signedExpiry: number | undefined;
  const dependencies: R2StorageDependencies = {
    getConfiguration: () => configuration,
    createClient: () => {
      createCount += 1;
      return {
        send: async (command: unknown) => {
          commands.push(command);
          if (command instanceof HeadObjectCommand) {
            if ((command.input.Key as string).includes("missing")) {
              throw Object.assign(new Error("missing"), { name: "NotFound", $metadata: { httpStatusCode: 404 } });
            }
            return { ContentLength: 1024, ContentType: "application/pdf", ETag: "etag", Metadata: { version: "v1" } };
          }
          if (command instanceof GetObjectCommand) return {
            ContentLength: validPdf.body.byteLength,
            ContentType: "application/pdf",
            Body: { transformToByteArray: async () => validPdf.body },
          };
          return {};
        },
        presign: async () => "https://signed.example.test/private.pdf",
      };
    },
    signDownload: async (_client, command, expiresInSeconds) => {
      assert.ok(command instanceof GetObjectCommand);
      signedExpiry = expiresInSeconds;
      return "https://signed.example.test/private.pdf";
    },
    ...overrides,
  };
  return { dependencies, commands, created: () => createCount, signedExpiry: () => signedExpiry };
}

test("R2 credentials remain optional until an operation requests the provider", async () => {
  assert.doesNotThrow(() => getR2Storage());
  const storage = createR2Storage({
    getConfiguration: () => resolveR2Configuration(parseServerEnv({ NODE_ENV: "test", R2_BUCKET_NAME: "private-test-bucket" })),
    createClient: () => assert.fail("R2 client must not initialize without configuration"),
    signDownload: async () => assert.fail("signer must not initialize without configuration"),
  });
  await assert.rejects(
    storage.exists("masters/asset/versions/550e8400-e29b-41d4-a716-446655440000.pdf"),
    IntegrationConfigurationError,
  );
});

test("R2 config uses account-specific HTTPS endpoint, bucket, and auto region", () => {
  const config = resolveR2Configuration(parseServerEnv(validR2Env));
  assert.equal(config.endpoint, `https://${accountId}.r2.cloudflarestorage.com`);
  assert.equal(config.bucketName, "moneytree-private-test");
  assert.equal(config.region, "auto");
  assert.equal(config.downloadUrlTtlSeconds, 60);
  assert.deepEqual(getR2SdkClientOptions(config), {
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    region: "auto",
    forcePathStyle: true,
  });
});

test("R2 client is lazy and reused for upload, metadata, existence, and deletion", async () => {
  const fake = fakeDependencies();
  const storage = createR2Storage(fake.dependencies);
  assert.equal(fake.created(), 0);

  await storage.upload(validPdf);
  const metadata = await storage.getMetadata(validPdf.objectKey);
  assert.equal(metadata?.sizeBytes, 1024);
  assert.equal(await storage.exists(validPdf.objectKey), true);
  assert.equal(await storage.exists("masters/missing/versions/550e8400-e29b-41d4-a716-446655440001.pdf"), false);
  await storage.delete(validPdf.objectKey);

  assert.equal(fake.created(), 1);
  const upload = fake.commands.find((command) => command instanceof PutObjectCommand) as PutObjectCommand;
  assert.equal(upload.input.Bucket, configuration.bucketName);
  assert.equal(upload.input.Key, validPdf.objectKey);
  assert.equal(upload.input.ContentType, "application/pdf");
  assert.equal(upload.input.ContentLength, validPdf.body.byteLength);
  assert.deepEqual(upload.input.Metadata, validPdf.metadata);
  assert.ok(fake.commands.some((command) => command instanceof DeleteObjectCommand));
});

test("R2 private PDF reads validate the key, content signature, MIME, and size", async () => {
  const fake = fakeDependencies();
  const storage = createR2Storage(fake.dependencies);
  const bytes = await storage.getPrivatePdf(validPdf.objectKey);
  assert.deepEqual(bytes, validPdf.body);
  assert.ok(fake.commands.some((command) => command instanceof GetObjectCommand));
  await assert.rejects(storage.getPrivatePdf("public/guide.pdf"), { name: "ValidationError" });
  const bad = fakeDependencies({
    createClient: () => ({
      send: async () => ({ ContentLength: 5, ContentType: "application/pdf", Body: { transformToByteArray: async () => new TextEncoder().encode("wrong") } }),
      presign: async () => "",
    }),
  });
  await assert.rejects(createR2Storage(bad.dependencies).getPrivatePdf(validPdf.objectKey), ProviderCommunicationError);
});

test("signed R2 download uses the configured expiry and refuses missing objects", async () => {
  const fake = fakeDependencies();
  const storage = createR2Storage(fake.dependencies);
  const url = await storage.createSignedDownloadUrl({ objectKey: validPdf.objectKey });
  assert.equal(url, "https://signed.example.test/private.pdf");
  assert.equal(fake.signedExpiry(), configuration.downloadUrlTtlSeconds);
  await assert.rejects(
    storage.createSignedDownloadUrl({ objectKey: "masters/missing/versions/550e8400-e29b-41d4-a716-446655440001.pdf" }),
    NotFoundError,
  );
  assert.throws(() => validateSignedUrlExpiry(901), { name: "ValidationError" });
});

test("R2 rejects unsafe keys, filenames, oversized uploads, wrong MIME, and invalid PDF signatures", () => {
  assert.throws(() => assertSafeObjectKey("../../secret.pdf"));
  assert.throws(() => assertSafeObjectKey("public/products/a.pdf"));
  assert.throws(() => assertSafeObjectKey("masters/a/../secret.pdf"));
  assert.throws(() => assertSafeObjectKey("masters/a/file.zip"));
  assert.throws(() => createPrivatePdfObjectKey("masters", "customer@example.com"));

  const key = createPrivatePdfObjectKey("personalized", "purchase_123");
  assert.match(key, /^personalized\/purchase_123\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.pdf$/i);
  assert.doesNotThrow(() => validatePdfUpload(validPdf, configuration.maxUploadBytes));
  assert.throws(() => validatePdfUpload({ ...validPdf, body: new Uint8Array(configuration.maxUploadBytes + 1) }, configuration.maxUploadBytes));
  assert.throws(() => validatePdfUpload({ ...validPdf, contentType: "application/octet-stream" as "application/pdf" }, configuration.maxUploadBytes));
  assert.throws(() => validatePdfUpload({ ...validPdf, body: new TextEncoder().encode("not a pdf") }, configuration.maxUploadBytes));
  assert.throws(() => validatePdfUpload({ ...validPdf, originalFileName: "../guide.pdf" }, configuration.maxUploadBytes));
});

test("master upload validation parses the full PDF instead of trusting only its header", async () => {
  const document = await PDFDocument.create();
  document.addPage();
  const valid = Uint8Array.from(await document.save());
  await assert.doesNotReject(assertReadablePdfDocument(valid));
  await assert.rejects(assertReadablePdfDocument(new TextEncoder().encode("%PDF-not-a-valid-document")), { name: "ValidationError" });
});

test("R2 provider failures map safely and do not preserve raw secret-bearing diagnostics", async () => {
  const secret = "test-secret-must-not-leak";
  const fake = fakeDependencies({
    createClient: () => ({
      send: async () => { throw new Error(`request failed secret=${secret}`); },
      presign: async () => "",
    }),
  });
  const storage = createR2Storage(fake.dependencies);
  await assert.rejects(storage.exists(validPdf.objectKey), (error: unknown) => {
    assert.ok(error instanceof ProviderCommunicationError);
    assert.doesNotMatch(error.message, new RegExp(secret));
    return true;
  });
});
