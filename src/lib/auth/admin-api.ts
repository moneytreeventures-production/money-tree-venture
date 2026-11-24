import "server-only";

import { ApplicationError } from "../errors/app-error";
import { createErrorResponse } from "../errors/response";
import { logger } from "../logger";
import { resolveRequestId } from "../http/request-id";
import { assertMutationOrigin } from "../http/mutation-origin";
import type { User } from "../db/models/user";
import { requireAdmin } from "./admin";

export type AdminApiHandler<Context = unknown> = (
  request: Request,
  admin: User,
  context: Context,
) => Response | Promise<Response>;

/** Wrap a Route Handler so authorization and safe error responses stay consistent. */
export function createAdminApiWrapper(authorize: () => Promise<User> = requireAdmin) {
  return function withAdmin<Context = unknown>(handler: AdminApiHandler<Context>) {
    return async (request: Request, context: Context): Promise<Response> => {
      // Request data must be accessed before the catch block so Next.js can
      // defer admin authorization instead of catching a prerender bailout.
      const routeGroup = new URL(request.url).pathname.split("/").slice(0, 4).join("/");
      const requestId = resolveRequestId(request);
      try {
        if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) assertMutationOrigin(request);
        const admin = await authorize();
        return await handler(request, admin, context);
      } catch (error) {
        if (!(error instanceof ApplicationError)) {
          logger.error("admin.api.request_failed", {
            requestId,
            errorName: error instanceof Error ? error.name : "UnknownError",
            routeGroup,
          });
        }
        return createErrorResponse(error, requestId);
      }
    };
  };
}

export const withAdmin = createAdminApiWrapper();
