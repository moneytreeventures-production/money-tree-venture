import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
async function main() {
  const args = process.argv.slice(2);
  const database = args[args.indexOf("--confirm-database") + 1];
  if (!args.includes("--confirm-database") || !database || !args.includes("--confirm-non-production")) throw new Error("Explicit database and non-production confirmation required");
  const mode = args.includes("--reconcile") ? "reconcile" : args.includes("--purge") ? "purge" : "expire";
  if (mode === "reconcile" && args.includes("--apply") && !args.includes("--confirm-reconciliation")) throw new Error("Explicit reconciliation confirmation required");
  const { maintainOrders } = await import("../src/lib/checkout/order-maintenance");
  const result = await maintainOrders({ mode, database, dryRun: !args.includes("--apply"), retentionDays: Number(process.env.ORDER_RETENTION_DAYS ?? 30) });
  console.log(JSON.stringify(result));
}
main().catch(() => { console.error("Order maintenance failed; no sensitive diagnostics emitted."); process.exitCode = 1; }).finally(async () => { const { default: mongoose } = await import("mongoose"); await mongoose.disconnect(); });
