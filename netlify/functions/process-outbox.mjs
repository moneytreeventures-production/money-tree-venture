import { workerEndpoint } from "./worker-endpoint.mjs";

export default async function processOutbox() {
  const appUrl = process.env.APP_URL;
  const workerSecret = process.env.OUTBOX_WORKER_SECRET;
  if (!appUrl || !workerSecret) {
    throw new Error("Outbox scheduler requires APP_URL and OUTBOX_WORKER_SECRET.");
  }

  const endpoint = workerEndpoint(appUrl, "/api/internal/outbox?limit=25");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { authorization: `Bearer ${workerSecret}` },
    signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) {
    throw new Error(`Outbox worker returned HTTP ${response.status}.`);
  }
}
