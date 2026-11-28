import { createServer } from "node:net";
import { spawn } from "node:child_process";

const projectRoot = process.cwd();
const configuredOrigin = process.env.APP_URL ? new URL(process.env.APP_URL).origin : null;

async function findAvailablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not allocate a local test port.");
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(baseUrl, path, init) {
  return await fetch(new URL(path, baseUrl), { signal: AbortSignal.timeout(5_000), ...init });
}

async function waitForServer(child, baseUrl) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error("Next.js production server exited before the smoke checks.");
    try {
      const response = await request(baseUrl, "/");
      if (response.status === 200) return;
    } catch {
      // The local server may need another moment to become ready.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Next.js production server did not become ready within 20 seconds.");
}

async function waitForChildExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return true;
  return await new Promise((resolve) => {
    let finished = false;
    const finish = (exited) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      child.off("exit", onExit);
      resolve(exited);
    };
    const onExit = () => finish(true);
    const timer = setTimeout(() => finish(false), timeoutMs);
    child.once("exit", onExit);
  });
}

const port = await findAvailablePort();
const baseUrl = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, [
  "node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port),
], {
  cwd: projectRoot,
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
  stdio: "ignore",
});

try {
  await waitForServer(child, baseUrl);

  const homepage = await request(baseUrl, "/");
  const homepageHtml = await homepage.text();
  assert(homepage.status === 200 && homepage.headers.get("content-type")?.includes("text/html"), "Homepage did not return production HTML.");
  assert(homepageHtml.includes("MoneyTreeVentures") && (!configuredOrigin || homepageHtml.includes(configuredOrigin)), "Homepage brand or configured canonical host was missing.");
  assert(homepage.headers.get("x-content-type-options") === "nosniff", "X-Content-Type-Options security header was missing.");
  assert(homepage.headers.get("x-frame-options") === "DENY", "X-Frame-Options security header was missing.");
  assert(homepage.headers.get("referrer-policy") === "strict-origin-when-cross-origin", "Referrer-Policy security header was missing.");
  assert(homepage.headers.get("permissions-policy") === "camera=(), microphone=(), geolocation=()", "Permissions-Policy security header was missing.");
  assert(homepage.headers.get("x-powered-by") === null, "Framework identification header should be disabled.");
  console.info("✓ Production homepage: HTTP 200 with brand and canonical metadata.");

  for (const path of ["/products", "/login", "/admin/login", "/about", "/contact", "/cart", "/checkout"]) {
    const response = await request(baseUrl, path);
    const html = await response.text();
    assert(response.status === 200 && response.headers.get("content-type")?.includes("text/html"), `${path} did not return production HTML.`);
    if (path === "/login") assert(html.includes("Admin Login"), "Customer login did not include the Admin Login entry.");
    if (path === "/admin/login") assert(html.includes("Admin Login") && html.includes("Back to User Login"), "Admin login page content was incomplete.");
    console.info(`✓ Production route ${path}: HTTP 200.`);
  }

  const legacyPreference = await request(baseUrl, "/", { headers: { cookie: "mtv-locale=hi" } });
  const englishHtml = await legacyPreference.text();
  assert(legacyPreference.status === 200 && /<html[^>]*lang="en"/.test(englishHtml), "Root language must remain English with an old preference.");
  assert(englishHtml.includes("Explore kits") && englishHtml.includes("Account") && englishHtml.includes("Cart"), "English navigation is incomplete.");
  assert(!englishHtml.includes("Choose language") && !englishHtml.includes("nav.products"), "Obsolete language controls or translation keys remain.");
  const removedEndpoint = await request(baseUrl, "/api/preferences/locale", { method: "POST" });
  assert(removedEndpoint.status === 404, "Removed locale endpoint must return 404.");
  console.info("English navigation and legacy preference isolation passed.");

  for (const route of ["/this-page-does-not-exist", "/products/INVALID_SLUG"]) {
    const response = await request(baseUrl, route);
    const html = await response.text();
    assert(html.includes("Page Not Found") && html.includes("Return Home"), "Branded not-found UI missing.");
    assert(/name="robots"[^>]*content="[^"]*noindex/.test(html), "Not-found noindex missing.");
    assert(route.startsWith("/products") ? [200, 404].includes(response.status) : response.status === 404, "Unexpected not-found status.");
    console.info(route + " status=" + response.status + " branded UI and noindex passed.");
  }

  const robots = await request(baseUrl, "/robots.txt");
  const robotsBody = await robots.text();
  assert(robots.status === 200 && robotsBody.includes("sitemap.xml") && robotsBody.includes("/api/"), "robots.txt response was incomplete.");
  console.info("✓ robots.txt: HTTP 200 with sitemap and private-path rules.");

  const sitemap = await request(baseUrl, "/sitemap.xml");
  const sitemapBody = await sitemap.text();
  assert(sitemap.status === 200 && (!configuredOrigin || sitemapBody.includes(configuredOrigin)), "Sitemap did not contain the configured canonical host.");
  console.info("✓ Sitemap: HTTP 200 with canonical URLs.");

  const unsupportedWebhookMethod = await request(baseUrl, "/api/webhooks/cashfree");
  assert(unsupportedWebhookMethod.status === 405, "Cashfree webhook route did not reject unsupported methods.");

  const unsignedWebhook = await request(baseUrl, "/api/webhooks/cashfree", {
    method: "POST", headers: { "content-type": "application/json" }, body: "{}",
  });
  assert([401, 503].includes(unsignedWebhook.status), "Unsigned Cashfree webhook was not rejected before payment processing.");
  const requestId = unsignedWebhook.headers.get("x-request-id");
  assert(typeof requestId === "string" && /^[0-9a-f-]{36}$/i.test(requestId), "Webhook error response did not include a safe request ID.");
  console.info(`✓ Cashfree webhook: unsupported method rejected; unsigned event rejected with HTTP ${unsignedWebhook.status}.`);
} finally {
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGTERM");
    if (!await waitForChildExit(child, 2_000)) {
      child.kill("SIGKILL");
      if (!await waitForChildExit(child, 2_000)) {
        throw new Error("Next.js production server could not be stopped after the smoke test.");
      }
    }
  }
}
