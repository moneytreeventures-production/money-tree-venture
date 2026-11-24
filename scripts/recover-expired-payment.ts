import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const TARGET_ORDER_ID = "6b0341108ffd602387cde275";

async function main() {
  const args = process.argv.slice(2);
  const valueAfter = (flag: string) => args[args.indexOf(flag) + 1];
  const apply = args.includes("--apply");
  const allowed = new Set(["--confirm-database", "moneytreeventures", "--confirm-sandbox", "--confirm-non-production",
    "--order-id", TARGET_ORDER_ID, "--dry-run", "--apply", "--owner-approved-apply"]);
  if (args.some((arg) => !allowed.has(arg)) || valueAfter("--confirm-database") !== "moneytreeventures" ||
      valueAfter("--order-id") !== TARGET_ORDER_ID || !args.includes("--confirm-sandbox") ||
      !args.includes("--confirm-non-production") || (apply && !args.includes("--owner-approved-apply")) ||
      (apply && args.includes("--dry-run")) || (!apply && args.includes("--owner-approved-apply"))) {
    throw new Error("GUARD_REJECTED");
  }
  const [{ default: mongoose, Types }, { connectToDatabase }, models, { getCashfreeConfiguration }, { getCashfreeClient },
    { decideExpiredFailureRecovery }, { recordVerifiedPaymentStatus }, { expireOrderIfSettled }] = await Promise.all([
    import("mongoose"), import("../src/lib/db/mongodb"), import("../src/lib/db/models"),
    import("../src/lib/payments/cashfree/config"), import("../src/lib/payments/cashfree/client"),
    import("../src/lib/payments/cashfree/expired-failure-recovery-plan"),
    import("../src/lib/payments/cashfree/payment-service"), import("../src/lib/checkout/order-service"),
  ]);
  if (getCashfreeConfiguration().environment !== "sandbox") throw new Error("SANDBOX_REQUIRED");
  await connectToDatabase();
  if (mongoose.connection.name !== "moneytreeventures") throw new Error("DATABASE_MISMATCH");
  const gateway = getCashfreeClient();
  const orderId = new Types.ObjectId(TARGET_ORDER_ID);

  async function inspect() {
    const order = await models.OrderModel.findById(orderId).lean().exec();
    if (!order || order.gatewayEnvironment !== "sandbox") throw new Error("ORDER_NOT_SANDBOX");
    const [attempts, activeClaims, purchases] = await Promise.all([
      models.PaymentModel.find({ orderId, userId: order.userId }).sort({ createdAt: 1 }).lean().exec(),
      models.CheckoutClaimModel.countDocuments({ orderId, userId: order.userId, status: "active" }),
      models.PurchaseModel.countDocuments({ orderId, userId: order.userId }),
    ]);
    if (attempts.length !== 1 || attempts.some((attempt) => !attempt.cashfreeOrderId ||
      !["pending", "failed"].includes(attempt.status) || attempt.gatewayEnvironment !== "sandbox" ||
      attempt.amountPaise !== order.totalPaise || attempt.currency !== order.currency)) {
      throw new Error("LOCAL_ATTEMPTS_AMBIGUOUS");
    }
    const providerOrders = [];
    for (const cashfreeOrderId of [...new Set(attempts.map((attempt) => attempt.cashfreeOrderId!))]) {
      const [providerOrder, payments] = await Promise.all([gateway.fetchOrder(cashfreeOrderId), gateway.fetchPayments(cashfreeOrderId)]);
      providerOrders.push({
        status: providerOrder.status,
        identityMatches: providerOrder.orderId === cashfreeOrderId,
        amountMatches: providerOrder.amountPaise === order.totalPaise && providerOrder.currency === order.currency,
        payments: payments.map((payment) => ({
          status: payment.status, identityMatches: payment.orderId === cashfreeOrderId,
          amountMatches: payment.amountPaise === order.totalPaise && payment.currency === order.currency,
          verified: payment,
        })),
      });
    }
    if (providerOrders.length !== 1 || providerOrders[0].payments.length !== 1) throw new Error("PROVIDER_ATTEMPTS_AMBIGUOUS");
    const decision = decideExpiredFailureRecovery({
      localOrderStatus: order.orderStatus, localPaymentStatus: order.paymentStatus,
      localExpiresAt: order.expiresAt, activeClaims, purchases, providerOrders,
    }, new Date());
    // Internal comparison only; never print provider IDs or transaction payloads.
    const revision = JSON.stringify({ updatedAt: order.updatedAt, state: [order.orderStatus, order.paymentStatus],
      attempts: attempts.map((attempt) => [attempt._id.toString(), attempt.updatedAt, attempt.status]), activeClaims, purchases,
      provider: providerOrders.map((item) => [item.status, item.payments.map((payment) => [payment.verified.paymentId, payment.status])]) });
    return { order, decision, activeClaims, purchases, providerOrders, revision };
  }

  const before = await inspect();
  console.log(JSON.stringify({ stage: "before", orderStatus: before.order.orderStatus, paymentStatus: before.order.paymentStatus,
    activeClaims: before.activeClaims, purchases: before.purchases, decision: before.decision, mode: apply ? "guarded_apply" : "dry_run" }));
  if (!apply || before.decision === "already_recovered") return;
  if (before.decision !== "eligible") throw new Error(before.decision);
  const refreshed = await inspect();
  if (refreshed.decision !== "eligible" || refreshed.revision !== before.revision) throw new Error("EVIDENCE_CHANGED");
  for (const providerOrder of refreshed.providerOrders) {
    for (const payment of providerOrder.payments) {
      await recordVerifiedPaymentStatus(orderId, refreshed.order.userId, payment.verified, providerOrder.status);
    }
  }
  await expireOrderIfSettled(orderId, refreshed.order.userId);
  const after = await models.OrderModel.findById(orderId).select("orderStatus paymentStatus").lean().exec();
  const [activeClaims, purchases] = await Promise.all([
    models.CheckoutClaimModel.countDocuments({ orderId, userId: refreshed.order.userId, status: "active" }),
    models.PurchaseModel.countDocuments({ orderId, userId: refreshed.order.userId }),
  ]);
  console.log(JSON.stringify({ stage: "after", orderStatus: after?.orderStatus ?? "missing", paymentStatus: after?.paymentStatus ?? "missing",
    activeClaims, purchases, outcome: after?.orderStatus === "expired" && after.paymentStatus === "failed" && activeClaims === 0 && purchases === 0
      ? "recovered" : "review_required" }));
}

main().catch((error: unknown) => {
  const safeCodes = new Set(["GUARD_REJECTED", "SANDBOX_REQUIRED", "DATABASE_MISMATCH", "ORDER_NOT_SANDBOX",
    "LOCAL_ATTEMPTS_AMBIGUOUS", "PROVIDER_ATTEMPTS_AMBIGUOUS", "EVIDENCE_CHANGED", "local_state_changed", "local_window_open", "unexpected_entitlement",
    "claim_count_changed", "provider_mismatch", "provider_not_expired", "provider_unresolved", "provider_success", "no_failed_attempt"]);
  console.error(JSON.stringify({ result: "stopped", category: error instanceof Error && safeCodes.has(error.message) ? error.message :
    error instanceof Error ? error.name : "UnknownError" }));
  process.exitCode = 1;
}).finally(async () => {
  const { default: mongoose } = await import("mongoose");
  await mongoose.disconnect();
});
