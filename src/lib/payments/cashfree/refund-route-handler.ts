import "server-only";

import { createAdminApiWrapper } from "../../auth/admin-api";
import type { User } from "../../db/models/user";
import { InternalServerError } from "../../errors/app-error";
import { createJsonResponse } from "../../http/response";
import { readJsonBody } from "../../catalog/route-utils";
import { requestFullCashfreeRefund } from "./refund-service";

type RefundContext = { params: Promise<{ id: string }> };

function adminProfileId(admin: User): string {
  if (!admin._id || admin.role !== "admin" || admin.status !== "active") throw new InternalServerError();
  return admin._id.toString();
}

export function createAdminRefundHandler(options: {
  authorize?: () => Promise<User>;
  requestRefund?: (orderId: string, adminId: string, input: unknown) => Promise<unknown>;
} = {}) {
  const withAdmin = createAdminApiWrapper(options.authorize);
  const requestRefund = options.requestRefund ?? requestFullCashfreeRefund;
  return withAdmin<RefundContext>(async (request, admin, context) => {
    const { id } = await context.params;
    const result = await requestRefund(id, adminProfileId(admin), await readJsonBody(request));
    return createJsonResponse({ success: true, data: result });
  });
}

export const adminRefundPOST = createAdminRefundHandler();
