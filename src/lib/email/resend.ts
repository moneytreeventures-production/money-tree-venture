import "server-only";

import { getServerEnv } from "../env/server";

export interface ResendMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export function buildResendRequest(message: ResendMessage, idempotencyKey: string, apiKey: string, sender: string): { url: string; init: RequestInit } {
  return {
    url: "https://api.resend.com/emails",
    init: {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        "idempotency-key": idempotencyKey,
      },
      body: JSON.stringify({ from: sender, to: [message.to], subject: message.subject, text: message.text, html: message.html }),
      signal: AbortSignal.timeout(10_000),
    },
  };
}

export async function parseResendAcceptance(response: Response): Promise<string> {
  if (!response.ok) {
    const category = response.status === 401 || response.status === 403 ? "authentication_rejected" :
      response.status === 429 ? "rate_limited" : response.status === 422 ? "request_rejected" : "provider_error";
    throw new Error(`RESEND_${category.toUpperCase()}_${response.status}`);
  }
  const body: unknown = await response.json().catch(() => null);
  if (!body || typeof body !== "object" || !("id" in body) || typeof body.id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(body.id)) {
    throw new Error("RESEND_ACCEPTANCE_MISSING");
  }
  return body.id;
}

export async function sendResendMessage(message: ResendMessage, idempotencyKey: string, fetcher: typeof fetch = fetch): Promise<string> {
  const env = getServerEnv();
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) throw new Error("EMAIL_CONFIGURATION_MISSING");
  const request = buildResendRequest(message, idempotencyKey, env.RESEND_API_KEY, env.EMAIL_FROM);
  let response: Response;
  try { response = await fetcher(request.url, request.init); }
  catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    throw new Error(code === "ENOTFOUND" || code === "EAI_AGAIN" ? "RESEND_DNS_FAILURE" : "RESEND_NETWORK_FAILURE");
  }
  return parseResendAcceptance(response);
}
