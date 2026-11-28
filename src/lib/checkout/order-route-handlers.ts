import "server-only";

import { createJsonResponse } from "../http/response";
import { resolveRequestId } from "../http/request-id";
import { createErrorResponse } from "../errors/response";
import { InternalServerError } from "../errors/app-error";
import { requireCustomer } from "../auth/session";
import type { User } from "../db/models/user";
import { readJsonBody } from "../catalog/route-utils";
import { assertMutationOrigin } from "../http/mutation-origin";
import { createOrder, getCustomerOrder, listCustomerOrders, previewCheckoutOwnership, setCustomerOrderArchived } from "./order-service";
import { z } from "zod";
import { requirePaymentCollection } from "../payments/payment-activation";

type OrderContext = { params: Promise<{ id: string }> };

export interface OrderRouteServices {
  createOrder(input: unknown, customer: { id: string; name: string; email: string }, key: string): Promise<unknown>;
  listCustomerOrders(customerId: string): Promise<unknown>;
  getCustomerOrder(orderId: string, customerId: string): Promise<unknown>;
  previewCheckoutOwnership(input: unknown, customerId: string): Promise<unknown>;
  setCustomerOrderArchived(orderId: string, customerId: string, archived: boolean): Promise<unknown>;
}

function profileId(customer: User): string {
  if (!customer._id || customer.status !== "active" || customer.role !== "customer") throw new InternalServerError();
  return customer._id.toString();
}

export function createOrderRouteHandlers(options: {
  authorize?: () => Promise<User>;
  services?: Partial<OrderRouteServices>;
} = {}) {
  const authorize = options.authorize ?? requireCustomer;
  const services: OrderRouteServices = { createOrder, listCustomerOrders, getCustomerOrder, previewCheckoutOwnership, setCustomerOrderArchived, ...options.services };

  const ownershipPOST = async (request: Request): Promise<Response> => {
    const requestId = resolveRequestId(request);
    try {
      assertMutationOrigin(request);
      const customer = await authorize();
      return createJsonResponse({ success: true, data: await services.previewCheckoutOwnership(await readJsonBody(request), profileId(customer)) }, requestId, { headers: { "Cache-Control": "private, no-store" } });
    } catch (error) { return createErrorResponse(error, requestId); }
  };

  const collectionGET = async (request: Request): Promise<Response> => {
    const requestId = resolveRequestId(request);
    try {
      const customer = await authorize();
      return createJsonResponse({ success: true, data: await services.listCustomerOrders(profileId(customer)) }, requestId);
    } catch (error) { return createErrorResponse(error, requestId); }
  };

  const collectionPOST = async (request: Request): Promise<Response> => {
    const requestId = resolveRequestId(request);
    try {
      assertMutationOrigin(request);
      const customer = await authorize();
      requirePaymentCollection();
      const key = request.headers.get("idempotency-key") ?? "";
      const data = await services.createOrder(await readJsonBody(request), {
        id: profileId(customer), name: customer.name, email: customer.email,
      }, key);
      return createJsonResponse({ success: true, data }, requestId, { status: 201 });
    } catch (error) { return createErrorResponse(error, requestId); }
  };

  const itemGET = async (request: Request, context: OrderContext): Promise<Response> => {
    const requestId = resolveRequestId(request);
    try {
      const customer = await authorize();
      const { id } = await context.params;
      return createJsonResponse({ success: true, data: await services.getCustomerOrder(id, profileId(customer)) }, requestId);
    } catch (error) { return createErrorResponse(error, requestId); }
  };

  const archivePATCH = async (request: Request, context: OrderContext): Promise<Response> => {
    const requestId = resolveRequestId(request);
    try {
      assertMutationOrigin(request);
      const customer = await authorize();
      const { id } = await context.params;
      const input = z.object({ archived: z.boolean() }).strict().parse(await readJsonBody(request));
      return createJsonResponse({ success: true, data: await services.setCustomerOrderArchived(id, profileId(customer), input.archived) }, requestId, { headers: { "Cache-Control": "private, no-store" } });
    } catch (error) { return createErrorResponse(error, requestId); }
  };

  return { collectionGET, collectionPOST, itemGET, ownershipPOST, archivePATCH };
}

const handlers = createOrderRouteHandlers();
export const orderHandlers = handlers;
