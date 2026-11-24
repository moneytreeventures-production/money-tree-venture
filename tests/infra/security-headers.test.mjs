import assert from "node:assert/strict";
import { test } from "node:test";
import nextConfig from "../../next.config.ts";

test("private customer and worker routes receive no-store headers", async () => {
  const rules = await nextConfig.headers();
  const protectedPaths = [
    "/account/:path*", "/admin/:path*", "/checkout/:path*",
    "/api/auth/:path*", "/api/admin/:path*", "/api/bookings/:path*",
    "/api/orders/:path*", "/api/purchases/:path*", "/api/internal/:path*",
    "/api/navigation/account",
  ];
  for (const source of protectedPaths) {
    assert.deepEqual(rules.find((rule) => rule.source === source)?.headers,
      [{ key: "Cache-Control", value: "private, no-store" }]);
  }
  const shared = rules.find((rule) => rule.source === "/:path*");
  assert.equal(shared.headers.find((header) => header.key === "X-Content-Type-Options")?.value, "nosniff");
  assert.equal(shared.headers.find((header) => header.key === "X-Frame-Options")?.value, "DENY");
});

test("HSTS is sent only for a configured production HTTPS origin", async () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalAppUrl = process.env.APP_URL;
  try {
    process.env.NODE_ENV = "production";
    process.env.APP_URL = "http://localhost:3000";
    assert.equal((await nextConfig.headers())[0].headers.some((header) => header.key === "Strict-Transport-Security"), false);
    process.env.APP_URL = "https://example.invalid";
    assert.equal((await nextConfig.headers())[0].headers.find((header) => header.key === "Strict-Transport-Security")?.value, "max-age=86400");
    process.env.APP_URL = "https://user:password@example.invalid";
    assert.equal((await nextConfig.headers())[0].headers.some((header) => header.key === "Strict-Transport-Security"), false);
  } finally {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = originalNodeEnv;
    if (originalAppUrl === undefined) delete process.env.APP_URL; else process.env.APP_URL = originalAppUrl;
  }
});
