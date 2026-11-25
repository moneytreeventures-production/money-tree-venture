import { loadEnvConfig } from "@next/env";
import { randomUUID } from "node:crypto";

export async function runResendSmoke(args: readonly string[]): Promise<void> {
  loadEnvConfig(process.cwd());
  const recipientPosition = args.indexOf("--recipient");
  const databasePosition = args.indexOf("--confirm-database");
  const recipient = recipientPosition >= 0 ? args[recipientPosition + 1] : undefined;
  const database = databasePosition >= 0 ? args[databasePosition + 1] : undefined;
  const send = args.includes("--send");
  const expectedLength = send ? 7 : 4;
  if (!recipient || !database || args.length !== expectedLength || (send && !args.includes("--confirm-non-production")) || database !== process.env.MONGODB_DB_NAME) {
    throw new Error("Usage: npm run email:test:resend -- --confirm-database <nonproduction-database> --recipient <approved-email> [--send --confirm-non-production --confirm-send]");
  }
  if (send && !args.includes("--confirm-send")) throw new Error("Explicit --confirm-send is required.");
  const { getServerEnv } = await import("../src/lib/env/server");
  const { buildEmailTestMessage, emailTestPolicy } = await import("../src/lib/email/email-testing");
  const { sendResendMessage } = await import("../src/lib/email/resend");
  const env = getServerEnv();
  const policy = emailTestPolicy({
    enabled: process.env.EMAIL_TESTING_ENABLED,
    appUrl: env.APP_URL,
    authUrl: process.env.BETTER_AUTH_URL,
    allowed: process.env.EMAIL_TEST_RECIPIENTS, recipient, database,
    localDatabase: process.env.EMAIL_TEST_DATABASE_NAME,
    localRole: process.env.EMAIL_TEST_DATABASE_ROLE,
    nodeEnv: env.NODE_ENV,
    netlify: process.env.NETLIFY });
  if (policy !== "allowed") throw new Error(`Email test policy rejected: ${policy}.`);
  if (send && database === "moneytreeventures") throw new Error("Use the owner-authorized dashboard for sending with the existing development database.");
  const senderAddress = env.EMAIL_FROM?.match(/<([^<>]+)>\s*$/)?.[1] ?? env.EMAIL_FROM;
  if (!env.RESEND_API_KEY) throw new Error("Resend API key is missing.");
  if (!env.APP_URL) throw new Error("Approved application URL is not configured.");
  if (!senderAddress || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(senderAddress)) throw new Error("A valid sender address is required.");
  if (!send) { console.info("DRY_RUN: configuration and allowlist passed; no email sent."); return; }
  const reference = randomUUID();
  const message = buildEmailTestMessage("basic", reference, `${env.APP_URL.replace(/\/$/, "")}/account`);
  message.to = recipient.trim().toLowerCase();
  const providerMessageId = await sendResendMessage(message, `email-smoke/${reference}`);
  console.info(JSON.stringify({ status: "accepted_by_resend", reference, providerMessageId, deliveryConfirmed: false }));
}

if (require.main === module) void runResendSmoke(process.argv.slice(2)).catch((error: unknown) => {
  const raw = error instanceof Error ? error.message : "EMAIL_TEST_FAILED";
  console.error(raw.startsWith("RESEND_") || raw.startsWith("Email test policy") || raw.startsWith("Usage:") || raw === "Explicit --confirm-send is required." || raw === "Resend API key is missing." || raw === "Approved sending domain is not configured." || raw === "Use the owner-authorized dashboard for sending with the existing development database." ? raw : "Email test could not complete.");
  process.exitCode = 1;
});
