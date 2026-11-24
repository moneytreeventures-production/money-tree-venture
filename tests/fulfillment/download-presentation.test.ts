import assert from "node:assert/strict";
import { test } from "node:test";
import { pdfDownloadButtonLabel } from "../../src/lib/fulfillment/download-presentation";

test("pending on-demand PDF offers a download instead of a permanent preparing state", () => {
  assert.equal(pdfDownloadButtonLabel("Guide", "pending", false), "Download Guide");
  assert.equal(pdfDownloadButtonLabel("Guide", "ready", false), "Download Guide");
});

test("active generation and failed copy have distinct retry feedback", () => {
  assert.equal(pdfDownloadButtonLabel("Guide", "pending", true), "Preparing Guide…");
  assert.equal(pdfDownloadButtonLabel("Guide", "failed", false), "Retry Guide download");
});
