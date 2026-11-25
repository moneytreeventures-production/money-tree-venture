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
    redirect: "manual",
    headers: { authorization: `Bearer ${workerSecret}` },
    signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) {
    let category = response.status >= 300 && response.status < 400 ? "redirect_blocked" : "unclassified_response";
    if (response.status === 401 && response.headers.get("content-type")?.includes("application/json")) {
      const body = await response.json().catch(() => null);
      if (body?.error?.code === "UNAUTHORIZED" && body?.error?.message === "Worker authorization required.") category = "application_worker_auth_rejected";
    }
    throw new Error(`Outbox worker returned HTTP ${response.status}; category=${category}.`);
  }
}
