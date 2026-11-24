import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { PDFDocument } from "pdf-lib";
import { hasMatchingPdfSha256 } from "../../src/lib/fulfillment/pdf-integrity";
import { personalizePdf, UnsupportedWatermarkCharactersError } from "../../src/lib/fulfillment/pdf-personalization";

test("buyer PDF copy receives a personalized footer on every page while the master remains untouched", async () => {
  const master = await PDFDocument.create();
  master.addPage([612, 792]);
  master.addPage([612, 792]);
  const masterBytes = await master.save();
  const original = Uint8Array.from(masterBytes);
  const personalized = await personalizePdf(masterBytes, {
    buyerName: "Asha Buyer",
    registeredEmail: "asha@example.com",
    orderReference: "MTV-ORDER-123",
    purchaseDate: new Date("2026-11-18T00:00:00.000Z"),
  });
  const result = await PDFDocument.load(personalized);
  assert.equal(result.getPageCount(), 2);
  assert.notDeepEqual(personalized, original);
  assert.deepEqual(masterBytes, original);
});

test("watermark rejects names unsupported by the bundled WinAnsi font instead of corrupting them", async () => {
  const master = await PDFDocument.create();
  master.addPage();
  const bytes = await master.save();
  await assert.rejects(personalizePdf(bytes, {
    buyerName: "\u0905\u0932\u094d\u0924\u092e\u093e\u0936",
    registeredEmail: "buyer@example.com",
    orderReference: "MTV-ORDER-1",
    purchaseDate: new Date(),
  }), UnsupportedWatermarkCharactersError);
});

test("PDF master integrity requires a matching SHA-256 digest", async () => {
  const master = await PDFDocument.create();
  master.addPage();
  const bytes = Uint8Array.from(await master.save());
  const digest = createHash("sha256").update(bytes).digest("hex");
  assert.equal(hasMatchingPdfSha256(bytes, digest), true);
  assert.equal(hasMatchingPdfSha256(bytes, "f".repeat(64)), false);
  assert.equal(hasMatchingPdfSha256(bytes, undefined), false);
});


test("PDF processing rejects oversized and corrupt masters without output", async () => {
  const buyer = { buyerName: "Test Buyer", registeredEmail: "unused@example.test", orderReference: "TEST", purchaseDate: new Date() };
  await assert.rejects(personalizePdf(new Uint8Array(20 * 1024 * 1024 + 1), buyer), /20 MiB/);
  await assert.rejects(personalizePdf(new Uint8Array([1, 2, 3]), buyer));
});
