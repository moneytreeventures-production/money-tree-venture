import assert from "node:assert/strict";
import { test } from "node:test";
import { publicSiteOrigin } from "../../src/lib/seo/site-url";
import sitemap from "../../src/app/sitemap";
import robots from "../../src/app/robots";

test("public search URLs require an explicitly configured HTTPS origin", () => {
  assert.equal(publicSiteOrigin(""), null);
  assert.equal(publicSiteOrigin("http://localhost:3000"), null);
  assert.equal(publicSiteOrigin("https://example.test/path"), null);
  assert.equal(publicSiteOrigin("https://user:password@example.test/"), null);
  assert.equal(publicSiteOrigin("https://example.test/"), "https://example.test");
});

test("sitemap and robots publish only the configured public HTTPS origin", () => {
  const previous = process.env.APP_URL;
  try {
    process.env.APP_URL = "http://localhost:3000";
    assert.deepEqual(sitemap(), []);
    assert.equal(robots().sitemap, undefined);
    process.env.APP_URL = "https://example.test/";
    assert.equal(sitemap()[0]?.url, "https://example.test/");
    assert.equal(robots().sitemap, "https://example.test/sitemap.xml");
  } finally {
    if (previous === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = previous;
  }
});
