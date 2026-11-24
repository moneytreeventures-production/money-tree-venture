import "server-only";

import { requireCustomer } from "../auth/session";
import type { User } from "../db/models/user";
import { InternalServerError } from "../errors/app-error";
import { createErrorResponse } from "../errors/response";
import { createJsonResponse } from "../http/response";
import { resolveRequestId } from "../http/request-id";
import { createPurchaseDownloadUrl, listCustomerPurchases, listPurchaseFiles } from "./download-service";

type PurchaseContext = { params: Promise<{ id: string }> };
type PurchaseFileContext = { params: Promise<{ id: string; fileId: string }> };

function trustedCustomerId(customer: User): string {
  if (!customer._id || customer.role !== "customer" || customer.status !== "active") throw new InternalServerError();
  return customer._id.toString();
}

export function createPurchaseRouteHandlers(options: {
  authorize?: () => Promise<User>;
  listPurchases?: typeof listCustomerPurchases;
  listFiles?: typeof listPurchaseFiles;
  downloadFile?: typeof createPurchaseDownloadUrl;
} = {}) {
  const authorize = options.authorize ?? requireCustomer;
  const listPurchases = options.listPurchases ?? listCustomerPurchases;
  const listFiles = options.listFiles ?? listPurchaseFiles;
  const downloadFile = options.downloadFile ?? createPurchaseDownloadUrl;

  const collectionGET = async (request: Request): Promise<Response> => {
    const requestId = resolveRequestId(request);
    try {
      const customer = await authorize();
      return createJsonResponse({ success: true, data: await listPurchases(trustedCustomerId(customer)) }, requestId);
    } catch (error) { return createErrorResponse(error, requestId); }
  };
  const filesGET = async (request: Request, context: PurchaseContext): Promise<Response> => {
    const requestId = resolveRequestId(request);
    try {
      const customer = await authorize();
      const { id } = await context.params;
      return createJsonResponse({ success: true, data: await listFiles(id, trustedCustomerId(customer)) }, requestId);
    } catch (error) { return createErrorResponse(error, requestId); }
  };
  const downloadGET = async (request: Request, context: PurchaseFileContext): Promise<Response> => {
    const requestId = resolveRequestId(request);
    try {
      const customer = await authorize();
      const { id, fileId } = await context.params;
      const file = await downloadFile(id, fileId, trustedCustomerId(customer));
      return new Response(Buffer.from(file.bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${file.filename}"`, "Content-Length": String(file.bytes.byteLength), "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" } });
    } catch (error) { return createErrorResponse(error, requestId); }
  };
  return { collectionGET, filesGET, downloadGET };
}

export const purchaseHandlers = createPurchaseRouteHandlers();
