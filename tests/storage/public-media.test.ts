import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import { createPublicMediaStorage, validateProductMediaDescriptor } from "../../src/lib/storage/public-media";
import type { PublicMediaConfiguration } from "../../src/lib/storage/public-media-config";

const configuration: PublicMediaConfiguration = {
  accountId: "a".repeat(32), endpoint: `https://${"a".repeat(32)}.r2.cloudflarestorage.com`, region: "auto",
  accessKeyId: "test", secretAccessKey: "test", stagingBucket: "media-staging", publicBucket: "media-public",
  baseUrl: "https://media.example.test", uploadUrlTtlSeconds: 300, maxImageBytes: 8 * 1024 * 1024,
  maxVideoBytes: 50 * 1024 * 1024, production: true,
};

function expectValidationError(callback: () => unknown) {
  assert.throws(callback, (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && error.code === "VALIDATION_ERROR"));
}

test("media descriptors enforce kind, extension, and configured size", () => {
  assert.equal(validateProductMediaDescriptor({ kind: "thumbnail", fileName: "cover.webp", contentType: "image/webp", sizeBytes: 100 }, configuration).extension, "webp");
  expectValidationError(() => validateProductMediaDescriptor({ kind: "thumbnail", fileName: "cover.pdf", contentType: "image/png", sizeBytes: 100 }, configuration));
  expectValidationError(() => validateProductMediaDescriptor({ kind: "promotional_video", fileName: "clip.mp4", contentType: "video/mp4", sizeBytes: 50 * 1024 * 1024 + 1 }, configuration));
  expectValidationError(() => validateProductMediaDescriptor({ kind: "thumbnail", fileName: "../cover.png", contentType: "image/png", sizeBytes: 100 }, configuration));
});

test("public upload URLs target staging and verified media is copied then staging is removed", async () => {
  const png = await sharp({ create: { width: 1, height: 1, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } }).png().toBuffer();
  const commands: Array<{ name: string; input: Record<string, unknown> }> = [];
  const storage = createPublicMediaStorage({
    getConfiguration: () => configuration,
    createClient: () => ({
      async send(command) {
        const typed = command as { constructor: { name: string }; input: Record<string, unknown> };
        commands.push({ name: typed.constructor.name, input: typed.input });
        if (typed.constructor.name === "HeadObjectCommand") return { ContentLength: png.length, ContentType: "image/png" };
        if (typed.constructor.name === "GetObjectCommand") return { Body: { transformToByteArray: async () => png } };
        return {};
      },
      async presign() { return "https://signed.example.test/put"; },
    }),
    signUpload: async (client, command) => {
      const typed = command as { input: Record<string, unknown> };
      commands.push({ name: "Presign", input: typed.input });
      return client.presign(command, 300);
    },
  });
  const stagingKey = `pending/${"b".repeat(24)}/${"c".repeat(8)}-1234-1234-1234-123456789012.upload`;
  const publicKey = `products/${"b".repeat(24)}/${"d".repeat(8)}-1234-1234-1234-123456789012.png`;
  assert.equal(await storage.createUploadUrl({ objectKey: stagingKey, contentType: "image/png" }), "https://signed.example.test/put");
  assert.equal(commands[0].input.Bucket, "media-staging");
  const result = await storage.validateAndPublish({ stagingKey, objectKey: publicKey, kind: "thumbnail", contentType: "image/png", expectedBytes: png.length, maximumBytes: 1000, publicUrlKey: "media-record" });
  assert.equal(result.publicUrl, `https://media.example.test/${publicKey}`);
  assert.equal(result.width, 1);
  assert.equal(commands.find((item) => item.name === "CopyObjectCommand")?.input.Bucket, "media-public");
  assert.ok(commands.some((item) => item.name === "DeleteObjectCommand" && item.input.Bucket === "media-staging"));
  assert.ok(commands.every((item) => item.input.Bucket !== "private-pdfs"));
});

test("storage rejects mismatched object size and unsafe object keys before publishing", async () => {
  let sends = 0;
  const storage = createPublicMediaStorage({
    getConfiguration: () => configuration,
    createClient: () => ({ async send() { sends += 1; return { ContentLength: 101, ContentType: "image/png" }; }, async presign() { return ""; } }),
    signUpload: async () => "",
  });
  const stagingKey = `pending/${"b".repeat(24)}/${"c".repeat(8)}-1234-1234-1234-123456789012.upload`;
  await assert.rejects(storage.validateAndPublish({ stagingKey, objectKey: `products/${"b".repeat(24)}/bad.png`, kind: "thumbnail", contentType: "image/png", expectedBytes: 100, maximumBytes: 1000, publicUrlKey: "x" }));
  assert.equal(sends, 0, "unsafe public key is rejected before provider access");
  await assert.rejects(storage.validateAndPublish({ stagingKey, objectKey: `products/${"b".repeat(24)}/${"d".repeat(8)}-1234-1234-1234-123456789012.png`, kind: "thumbnail", contentType: "image/png", expectedBytes: 100, maximumBytes: 1000, publicUrlKey: "x" }));
  assert.equal(sends, 1, "only staging HEAD occurs after size mismatch");
});
