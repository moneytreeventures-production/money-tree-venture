import assert from "node:assert/strict";
import { Types } from "mongoose";
import { test } from "node:test";
import { createProductMediaService, type ProductMediaServiceDependencies } from "../../src/lib/catalog/product-media-service";
import { createProductMediaRouteHandlers } from "../../src/lib/catalog/product-media-route-handlers";
import { AuthenticationError } from "../../src/lib/errors/app-error";
import type { ProductMedia } from "../../src/lib/db/models";
import type { PublicMediaStorage } from "../../src/lib/storage/public-media";
import type { PublicMediaConfiguration } from "../../src/lib/storage/public-media-config";

const productId = new Types.ObjectId();
const adminId = new Types.ObjectId();
const configuration: PublicMediaConfiguration = {
  accountId: "a".repeat(32), endpoint: `https://${"a".repeat(32)}.r2.cloudflarestorage.com`, region: "auto", accessKeyId: "x", secretAccessKey: "x",
  stagingBucket: "staging", publicBucket: "public", baseUrl: "https://media.example.test", uploadUrlTtlSeconds: 300,
  maxImageBytes: 8_000_000, maxVideoBytes: 50_000_000, production: true,
};

function makeService(overrides: Partial<ProductMediaServiceDependencies> = {}) {
  const records: Array<ProductMedia & { _id: Types.ObjectId; save(): Promise<void> }> = [];
  const updates: Array<{ kind: string; url: string | null }> = [];
  const calls: string[] = [];
  const storage: PublicMediaStorage = {
    async createUploadUrl(input) { calls.push(`sign:${input.objectKey}`); return "https://signed.test/upload"; },
    async validateAndPublish(input) { calls.push(`verify:${input.stagingKey}`); return { sizeBytes: 120, width: 640, height: 480, publicUrl: `https://media.example.test/${input.objectKey}` }; },
    async deleteStagingObject(key) { calls.push(`delete-staging:${key}`); },
    async deletePublicObject(key) { calls.push(`delete-public:${key}`); },
  };
  const dependencies: ProductMediaServiceDependencies = {
    connect: async () => undefined,
    configuration: () => configuration,
    storage,
    findProduct: async () => ({ _id: productId, publicationStatus: "draft", imageRefs: [] }),
    createMedia: async (input) => {
      const record = { ...input, _id: input._id ?? new Types.ObjectId(), async save() {} } as typeof records[number];
      records.push(record);
      return record;
    },
    findMedia: async (filter) => records.find((record) => String(record._id) === String(filter._id) && String(record.productId) === String(filter.productId) && String(record.uploadedBy) === String(filter.uploadedBy) && (!filter.kind || record.kind === filter.kind) && (!filter.status || record.status === filter.status)) ?? null,
    listMedia: async () => records,
    updateProductMedia: async (_id, kind, url) => { updates.push({ kind, url }); },
    ...overrides,
  };
  return { service: createProductMediaService(dependencies), records, updates, calls };
}

test("admin media upload uses a safe staged key and attaches only a verified public reference", async () => {
  const { service, records, updates, calls } = makeService();
  const intent = await service.beginUpload(productId.toString(), adminId.toString(), { kind: "thumbnail", fileName: "cover.png", contentType: "image/png", sizeBytes: 120 });
  assert.match(intent.uploadUrl, /^https:\/\//);
  assert.match(records[0].stagingObjectKey, /^pending\/[a-f0-9]{24}\/[0-9a-f-]{36}\.upload$/i);
  assert.ok(calls.some((call) => call.startsWith("sign:pending/")));
  const completed = await service.completeUpload(productId.toString(), intent.mediaId, adminId.toString());
  assert.equal(records[0].status, "ready");
  assert.equal(updates[0].kind, "thumbnail");
  assert.equal(updates[0].url, completed.publicUrl);
  assert.ok(calls.some((call) => call.startsWith("verify:pending/")));
});

test("media upload rejects invalid descriptors and refuses another administrator's upload", async () => {
  const { service } = makeService();
  await assert.rejects(service.beginUpload(productId.toString(), adminId.toString(), { kind: "thumbnail", fileName: "guide.pdf", contentType: "application/pdf", sizeBytes: 120 }));
  const intent = await service.beginUpload(productId.toString(), adminId.toString(), { kind: "promotional_video", fileName: "preview.mp4", contentType: "video/mp4", sizeBytes: 120 });
  await assert.rejects(service.completeUpload(productId.toString(), intent.mediaId, new Types.ObjectId().toString()));
});

test("admin media upload route authorizes before calling upload services", async () => {
  let called = false;
  const handlers = createProductMediaRouteHandlers({
    authorize: async () => { throw new AuthenticationError(); },
    services: { async beginUpload() { called = true; return {}; } },
  });
  const response = await handlers.uploadPOST(new Request("https://example.test/api/admin/products/id/media/uploads", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "thumbnail" }),
  }), { params: Promise.resolve({ id: productId.toString() }) });
  assert.equal(response.status, 401);
  assert.equal(called, false);
});

