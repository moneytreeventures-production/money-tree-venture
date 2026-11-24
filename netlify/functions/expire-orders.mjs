import { workerEndpoint } from "./worker-endpoint.mjs";

export default async function expireOrders() {
  if (process.env.ORDER_EXPIRATION_ENABLED !== "true" && process.env.PAYMENT_RECONCILIATION_ENABLED !== "true") return;
  const origin = process.env.APP_URL;
  const secret = process.env.OUTBOX_WORKER_SECRET;
  if (!origin || !secret) throw new Error("Maintenance configuration missing");
  const response = await fetch(workerEndpoint(origin, "/api/internal/order-maintenance?limit=10"), { method: "POST", headers: { authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(25000) });
  if (!response.ok) throw new Error(`Maintenance HTTP ${response.status}`);
}
