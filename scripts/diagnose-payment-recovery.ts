import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const args = process.argv.slice(2);
  const valueAfter = (flag: string) => args[args.indexOf(flag) + 1];
  const database = valueAfter("--confirm-database");
  const orderIds = args.flatMap((arg, index) => arg === "--order-id" ? [args[index + 1]] : []);
  const singleInitiation = args.includes("--single-initiation-order");
  if (database !== "moneytreeventures" || !args.includes("--confirm-sandbox") ||
      !args.includes("--dry-run-recovery") || args.includes("--apply") ||
      (singleInitiation ? orderIds.length !== 1 || orderIds[0] !== "6b0505cd97e9bf0ea159f184" : orderIds.length !== 2) ||
      orderIds.some((id) => !/^[a-f0-9]{24}$/i.test(id)) || new Set(orderIds).size !== orderIds.length) {
    throw new Error("Confirm moneytreeventures, sandbox, dry run, and the required order ID(s).");
  }
  const [{ default: mongoose }, { connectToDatabase }, models, { getCashfreeConfiguration }, { getCashfreeClient }, { classifyPaymentRecovery }] = await Promise.all([
    import("mongoose"), import("../src/lib/db/mongodb"), import("../src/lib/db/models"),
    import("../src/lib/payments/cashfree/config"), import("../src/lib/payments/cashfree/client"),
    import("../src/lib/payments/cashfree/recovery-plan"),
  ]);
  const config = getCashfreeConfiguration();
  if (config.environment !== "sandbox") throw new Error("Cashfree sandbox configuration required.");
  await connectToDatabase();
  if (mongoose.connection.name !== database) throw new Error("Connected database does not match confirmation.");
  const gateway = getCashfreeClient();
  const safeStatus = (value: string) => ["ACTIVE", "PAID", "EXPIRED", "TERMINATED", "SUCCESS", "FAILED", "PENDING", "USER_DROPPED", "NOT_ATTEMPTED"].includes(value) ? value : "OTHER";
  const safeFailureCategory = (value?: string) => {
    if (!value) return "none";
    if (/timeout/i.test(value)) return "timeout";
    if (/network|connection|dns/i.test(value)) return "network";
    if (/cashfree|provider|gateway/i.test(value)) return "provider";
    if (/valid|snapshot/i.test(value)) return "validation";
    return "other";
  };
  for (const [index, id] of orderIds.entries()) {
    const order = await models.OrderModel.findById(id).lean().exec();
    if (!order || order.gatewayEnvironment !== "sandbox") {
      console.log(JSON.stringify({ selectedOrder: index + 1, classification: "missing_or_not_sandbox" }));
      continue;
    }
    const [attempts, purchaseCount, activeClaimCount, claimCount, outboxCount, webhookEventCount] = await Promise.all([
      models.PaymentModel.find({ orderId: order._id }).sort({ createdAt: 1 }).lean().exec(),
      models.PurchaseModel.countDocuments({ orderId: order._id }),
      models.CheckoutClaimModel.countDocuments({ orderId: order._id, status: "active" }),
      models.CheckoutClaimModel.countDocuments({ orderId: order._id }),
      models.OutboxEventModel.countDocuments({ dedupeKey: `purchase-confirmation:${order._id.toString()}` }),
      models.WebhookEventModel.countDocuments({ orderId: order._id }),
    ]);
    const providerOrders = [];
    const providerIds = [...new Set(attempts.flatMap((attempt) => attempt.cashfreeOrderId ? [attempt.cashfreeOrderId] : []))];
    if (providerIds.length > 25) throw new Error("Too many provider orders for bounded diagnostic.");
    for (const cashfreeOrderId of providerIds) {
      let providerOrder;
      let providerPayments;
      try {
        [providerOrder, providerPayments] = await Promise.all([gateway.fetchOrder(cashfreeOrderId), gateway.fetchPayments(cashfreeOrderId)]);
      } catch (error) {
        providerOrders.push({ lookup: "unavailable", errorCategory: error instanceof Error ? error.name : "UnknownError",
          status: "OTHER", identityMatches: false, amountMatches: false, currencyMatches: false,
          paymentSessionPresent: false, paymentStatuses: [] });
        continue;
      }
      const identityMatches = providerOrder.orderId === cashfreeOrderId;
      const amountMatches = providerOrder.amountPaise === order.totalPaise;
      const currencyMatches = providerOrder.currency === order.currency;
      const paymentStatuses = providerPayments.map((payment) => ({
        status: safeStatus(payment.status),
        identityMatches: payment.orderId === cashfreeOrderId,
        amountMatches: payment.amountPaise === order.totalPaise,
        currencyMatches: payment.currency === order.currency,
      }));
      providerOrders.push({ lookup: "found", status: safeStatus(providerOrder.status), identityMatches, amountMatches,
        currencyMatches, paymentSessionPresent: Boolean(providerOrder.paymentSessionId), paymentStatuses });
    }
    console.log(JSON.stringify({
      selectedOrder: index + 1, database, environment: "sandbox", localOrderStatus: order.orderStatus,
      localPaymentStatus: order.paymentStatus,
      localAttemptCount: attempts.length,
      localAttemptStatuses: attempts.map((attempt) => ({ status: attempt.status, providerStatus: safeStatus(attempt.providerStatus ?? "unknown"),
        providerOrderIdRecorded: Boolean(attempt.cashfreeOrderId), initiationErrorCategory: safeFailureCategory(attempt.failureCode),
        lastEventRecorded: attempt.lastEventAt instanceof Date, createdAtRecorded: attempt.createdAt instanceof Date })),
      providerOrders, purchaseCount, activeClaimCount, otherClaimCount: claimCount - activeClaimCount,
      confirmationOutboxCount: outboxCount, webhookEventCount,
      reconciliation: classifyPaymentRecovery({ localPaymentStatus: order.paymentStatus,
        providerOrders: providerOrders.map((providerOrder) => ({ ...providerOrder,
          amountMatches: providerOrder.amountMatches && providerOrder.currencyMatches,
          paymentStatuses: providerOrder.paymentStatuses.map((payment) => ({ ...payment,
            amountMatches: payment.amountMatches && payment.currencyMatches })),
        })) }),
      action: "read_only_no_changes",
    }));
  }
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({ category: error instanceof Error ? error.name : "UnknownError", action: "diagnostic_failed_no_changes" }));
  process.exitCode = 1;
}).finally(async () => {
  const { default: mongoose } = await import("mongoose");
  await mongoose.disconnect();
});
