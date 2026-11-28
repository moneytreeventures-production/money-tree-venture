import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

const env = process.env;
const origin = new URL(env.APP_URL ?? "https://invalid.example");
const authOrigin = new URL(env.BETTER_AUTH_URL ?? "https://invalid.example");
if (env.EMAIL_LOCAL_WORKER_ENABLED !== "true" || env.NODE_ENV !== "development" || env.NETLIFY === "true" || origin.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(origin.hostname) || authOrigin.origin !== origin.origin || env.MONGODB_DB_NAME !== "moneytreeventures" || env.EMAIL_TEST_DATABASE_NAME !== env.MONGODB_DB_NAME || env.EMAIL_TEST_DATABASE_ROLE !== "local-development-only" || !env.OUTBOX_WORKER_SECRET || !env.EMAIL_TEST_RECIPIENTS?.trim()) {
  throw new Error("Local outbox worker configuration is incomplete or unsafe.");
}

const createdAfter = new Date().toISOString();
const endpoint = new URL("/api/internal/outbox", origin);
endpoint.searchParams.set("limit", "5");
endpoint.searchParams.set("createdAfter", createdAfter);
console.info("Local outbox worker armed for events created after startup only. Press Ctrl+C to stop.");
const controller = new AbortController();
process.on("SIGINT", () => controller.abort());

while (!controller.signal.aborted) {
  try {
    const response = await fetch(endpoint, { method: "POST", redirect: "manual", headers: { authorization: `Bearer ${env.OUTBOX_WORKER_SECRET}` }, signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(`Local outbox worker HTTP ${response.status}.`);
    console.info("Local outbox worker check completed.");
  } catch (error) {
    if (!controller.signal.aborted) console.error(error instanceof Error && /^Local outbox worker HTTP \d{3}\.$/.test(error.message) ? error.message : "Local outbox worker request failed.");
  }
  if (!controller.signal.aborted) await new Promise((resolve) => { const timer = setTimeout(resolve, 15_000); controller.signal.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true }); });
}
