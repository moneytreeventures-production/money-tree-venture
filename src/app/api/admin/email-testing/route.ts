import { classifyAdminAccessError, requireAdmin } from "@/lib/auth/admin";
import { isTrustedMutationOrigin } from "@/lib/http/mutation-origin";
import { readEmailTestHealth, sendEmailTest } from "@/lib/email/email-testing";

export async function GET() {
  try { await requireAdmin(); }
  catch (error) { const anonymous = classifyAdminAccessError(error) === "authentication"; return Response.json({ error: anonymous ? "Sign in to view email status." : "Owner authorization required." }, { status: anonymous ? 401 : 403 }); }
  try { return Response.json(await readEmailTestHealth(), { headers: { "cache-control": "no-store" } }); }
  catch (error) {
    const code = error instanceof Error ? error.message : "EMAIL_STATUS_UNAVAILABLE";
    return Response.json({ error: code === "WRONG_ENVIRONMENT" ? "Email testing is unavailable in this environment." : "Email status is temporarily unavailable.", code: code === "WRONG_ENVIRONMENT" ? code : "EMAIL_STATUS_UNAVAILABLE" }, { status: code === "WRONG_ENVIRONMENT" ? 403 : 503 });
  }
}

export async function POST(request: Request) {
  if (!isTrustedMutationOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  let admin;
  try { admin = await requireAdmin(); }
  catch (error) { const anonymous = classifyAdminAccessError(error) === "authentication"; return Response.json({ error: anonymous ? "Sign in to send a test." : "Owner authorization required." }, { status: anonymous ? 401 : 403 }); }
  if (!admin._id) return Response.json({ error: "Owner authorization required." }, { status: 403 });
  let input: unknown;
  try { input = await request.json(); } catch { return Response.json({ error: "Invalid request." }, { status: 400 }); }
  if (!input || typeof input !== "object" || !("recipient" in input) || typeof input.recipient !== "string" || !("kind" in input) || (input.kind !== "basic" && input.kind !== "purchase")) return Response.json({ error: "Choose a valid recipient and test type." }, { status: 400 });
  try { return Response.json(await sendEmailTest(admin._id.toString(), input.recipient, input.kind)); }
  catch (error) {
    const code = error instanceof Error ? error.message : "EMAIL_TEST_FAILED";
    const messages: Record<string, [number, string]> = {
      DISABLED: [403, "Email testing is disabled."], WRONG_ENVIRONMENT: [403, "Email testing is unavailable in this environment."], INVALID_RECIPIENT: [400, "Enter a valid email address."], RECIPIENT_NOT_ALLOWED: [403, "This recipient is not approved for tests."],
      EMAIL_TEST_RATE_LIMITED: [429, "Test limit reached. Try again later."], EMAIL_CONFIGURATION_MISSING: [503, "Email configuration is incomplete."], RATE_LIMIT_INDEX_MISSING: [503, "The email test rate limit is not ready."], EMAIL_PROVIDER_FAILED: [502, "Resend did not accept this test email."],
    };
    const [status, message] = messages[code] ?? [503, "Email testing is temporarily unavailable."];
    return Response.json({ error: message, code: messages[code] ? code : "EMAIL_TEST_UNAVAILABLE" }, { status });
  }
}
