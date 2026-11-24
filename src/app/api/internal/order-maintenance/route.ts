import { createOutboxRouteHandler } from "@/lib/email/outbox-route-handler";
import { maintainOrders } from "@/lib/checkout/order-maintenance";
export const POST = createOutboxRouteHandler(async (limit) => {
  const database = process.env.ORDER_MAINTENANCE_DATABASE;
  if (!database) throw new Error("Maintenance database confirmation required");
  const expiration = process.env.ORDER_EXPIRATION_ENABLED === "true"
    ? await maintainOrders({ mode: "expire", database, limit, dryRun: false }) : { disabled: true };
  const reconciliation = process.env.PAYMENT_RECONCILIATION_ENABLED === "true"
    ? await maintainOrders({ mode: "reconcile", database, limit: 1, dryRun: false }) : { disabled: true };
  return { expiration, reconciliation };
});
