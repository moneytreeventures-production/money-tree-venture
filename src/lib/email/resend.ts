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

export async function sendResendMessage(message: ResendMessage, idempotencyKey: string, fetcher: typeof fetch = fetch): Promise<void> {
  const env = getServerEnv();
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) throw new Error("EMAIL_CONFIGURATION_MISSING");
  const request = buildResendRequest(message, idempotencyKey, env.RESEND_API_KEY, env.EMAIL_FROM);
  const response = await fetcher(request.url, request.init);
  if (!response.ok) throw new Error(`RESEND_HTTP_${response.status}`);
}
