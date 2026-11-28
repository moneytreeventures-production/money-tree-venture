import "server-only";

import { requireCustomer } from "../../auth/session";
import type { User } from "../../db/models/user";
import { InternalServerError } from "../../errors/app-error";
import { createErrorResponse } from "../../errors/response";
import { createJsonResponse } from "../../http/response";
import { resolveRequestId } from "../../http/request-id";
import { readBoundedRequestBody } from "../../http/request-body";
import { readJsonBody } from "../../catalog/route-utils";
import { assertMutationOrigin } from "../../http/mutation-origin";
import { createCashfreePayment, getVerifiedPaymentStatus } from "./payment-service";
import { CASHFREE_WEBHOOK_MAX_BODY_BYTES, processCashfreeWebhook } from "./webhook-service";
import { requirePaymentCollection } from "../payment-activation";

type PaymentContext = { params: Promise<{ id: string }> };
type WebhookProcessor = (rawBody: string, headers: { timestamp: string | null; signature: string | null; idempotency: string | null }) => Promise<unknown>;

function customerId(customer: User): string {
  if (!customer._id || customer.role !== "customer" || customer.status !== "active") throw new InternalServerError();
  return customer._id.toString();
}

export function createCashfreePaymentRouteHandlers(options: {
  authorize?: () => Promise<User>;
  createPayment?: typeof createCashfreePayment;
  getStatus?: typeof getVerifiedPaymentStatus;
} = {}) {
  const authorize = options.authorize ?? requireCustomer;
  const createPayment = options.createPayment ?? createCashfreePayment;
  const getStatus = options.getStatus ?? getVerifiedPaymentStatus;
  const create = async (request: Request, context: PaymentContext): Promise<Response> => {
    const requestId = resolveRequestId(request);
    try {
      assertMutationOrigin(request);
      const customer = await authorize();
      requirePaymentCollection();
      const { id } = await context.params;
      const data = await createPayment(id, customerId(customer), await readJsonBody(request), request.headers.get("idempotency-key") ?? "", undefined, requestId);
      return createJsonResponse({ success: true, data }, requestId, { status: 201 });
    } catch (error) { return createErrorResponse(error, requestId); }
  };
  const status = async (request: Request, context: PaymentContext): Promise<Response> => {
    const requestId = resolveRequestId(request);
    try {
      const customer = await authorize();
      const { id } = await context.params;
      return createJsonResponse({ success: true, data: await getStatus(id, customerId(customer)) }, requestId);
    } catch (error) { return createErrorResponse(error, requestId); }
  };
  return { create, status };
}

export function createCashfreeWebhookHandler(process: WebhookProcessor = processCashfreeWebhook) {
  return async function POST(request: Request): Promise<Response> {
    const requestId = resolveRequestId(request);
    try {
      const result = await process(await readBoundedRequestBody(request, CASHFREE_WEBHOOK_MAX_BODY_BYTES), {
        timestamp: request.headers.get("x-webhook-timestamp"),
        signature: request.headers.get("x-webhook-signature"),
        idempotency: request.headers.get("x-idempotency-header"),
      });
      return createJsonResponse({ success: true, data: result }, requestId, { status: 200 });
    } catch (error) { return createErrorResponse(error, requestId); }
  };
}

const paymentHandlers = createCashfreePaymentRouteHandlers();
export const cashfreePaymentHandlers = paymentHandlers;
export const cashfreeWebhookPOST = createCashfreeWebhookHandler();
