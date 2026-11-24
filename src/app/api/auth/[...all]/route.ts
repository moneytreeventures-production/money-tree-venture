import { toNextJsHandler } from "better-auth/next-js";
import { createErrorResponse } from "../../../../lib/errors/response";
import { logger } from "../../../../lib/logger";
import { getAuth } from "../../../../lib/auth/auth";

async function handleAuthRequest(request: Request, method: "GET" | "POST"): Promise<Response> {
  try {
    const auth = await getAuth();
    return await toNextJsHandler(auth)[method](request);
  } catch (error) {
    logger.error("auth.api.request_failed", {
      provider: "better-auth",
      method,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return createErrorResponse(error);
  }
}

export function GET(request: Request): Promise<Response> {
  return handleAuthRequest(request, "GET");
}

export function POST(request: Request): Promise<Response> {
  return handleAuthRequest(request, "POST");
}
