import "server-only";

import { createAdminApiWrapper } from "../auth/admin-api";
import { requireCustomer } from "../auth/session";
import type { User } from "../db/models/user";
import { InternalServerError } from "../errors/app-error";
import { createErrorResponse } from "../errors/response";
import { readJsonBody } from "../catalog/route-utils";
import { createJsonResponse } from "../http/response";
import { resolveRequestId } from "../http/request-id";
import { assertMutationOrigin } from "../http/mutation-origin";
import { getCustomerBooking, listAdminBookings, listCustomerBookings, manageBooking, requestBookingAvailability } from "./booking-service";

type BookingContext = { params: Promise<{ id: string }> };
interface BookingServices {
  listCustomerBookings(customerId: string): Promise<unknown>;
  getCustomerBooking(id: string, customerId: string): Promise<unknown>;
  requestBookingAvailability(id: string, customerId: string, input: unknown): Promise<unknown>;
  listAdminBookings(input: { status?: string; page?: string; pageSize?: string }): Promise<unknown>;
  manageBooking(id: string, adminId: string, input: unknown): Promise<unknown>;
}

function profileId(user: User, role: "admin" | "customer"): string {
  if (!user._id || user.role !== role || user.status !== "active") throw new InternalServerError();
  return user._id.toString();
}

export function createBookingRouteHandlers(options: {
  authorizeCustomer?: () => Promise<User>;
  authorizeAdmin?: () => Promise<User>;
  services?: Partial<BookingServices>;
} = {}) {
  const authorizeCustomer = options.authorizeCustomer ?? requireCustomer;
  const withAdmin = createAdminApiWrapper(options.authorizeAdmin);
  const services: BookingServices = { listCustomerBookings, getCustomerBooking, requestBookingAvailability, listAdminBookings, manageBooking, ...options.services };

  const customerCollectionGET = async (request: Request): Promise<Response> => {
    const requestId = resolveRequestId(request);
    try {
      const customer = await authorizeCustomer();
      return createJsonResponse({ success: true, data: await services.listCustomerBookings(profileId(customer, "customer")) }, requestId);
    } catch (error) { return createErrorResponse(error, requestId); }
  };

  const customerItemGET = async (request: Request, context: BookingContext): Promise<Response> => {
    const requestId = resolveRequestId(request);
    try {
      const customer = await authorizeCustomer();
      const { id } = await context.params;
      return createJsonResponse({ success: true, data: await services.getCustomerBooking(id, profileId(customer, "customer")) }, requestId);
    } catch (error) { return createErrorResponse(error, requestId); }
  };

  const availabilityPATCH = async (request: Request, context: BookingContext): Promise<Response> => {
    const requestId = resolveRequestId(request);
    try {
      assertMutationOrigin(request);
      const customer = await authorizeCustomer();
      const { id } = await context.params;
      return createJsonResponse({ success: true, data: await services.requestBookingAvailability(id, profileId(customer, "customer"), await readJsonBody(request)) }, requestId);
    } catch (error) { return createErrorResponse(error, requestId); }
  };

  const adminCollectionGET = withAdmin(async (request) => {
    const query = new URL(request.url).searchParams;
    const result = await services.listAdminBookings({
      ...(query.has("status") ? { status: query.get("status")! } : {}),
      ...(query.has("page") ? { page: query.get("page")! } : {}),
      ...(query.has("pageSize") ? { pageSize: query.get("pageSize")! } : {}),
    });
    return createJsonResponse({ success: true, data: result });
  });

  const adminItemPATCH = withAdmin<BookingContext>(async (request, admin, context) => {
    const { id } = await context.params;
    const result = await services.manageBooking(id, profileId(admin, "admin"), await readJsonBody(request));
    return createJsonResponse({ success: true, data: result });
  });

  return { customerCollectionGET, customerItemGET, availabilityPATCH, adminCollectionGET, adminItemPATCH };
}

const handlers = createBookingRouteHandlers();
export const bookingHandlers = handlers;
