import "server-only";

import { createAdminApiWrapper } from "../auth/admin-api";
import { InternalServerError, ValidationError } from "../errors/app-error";
import type { User } from "../db/models/user";
import { createJsonResponse } from "../http/response";
import { readJsonBody } from "./route-utils";
import { beginProductMediaUpload, completeProductMediaUpload, listProductMedia, setProductMedia } from "./product-media-service";
import type { ProductMediaKind } from "../storage/public-media";

type ProductContext = { params: Promise<{ id: string }> };
type MediaContext = { params: Promise<{ id: string; mediaId: string }> };

export interface ProductMediaRouteServices {
  beginUpload(productId: string, adminId: string, input: unknown): Promise<unknown>;
  completeUpload(productId: string, mediaId: string, adminId: string): Promise<unknown>;
  list(productId: string, adminId: string): Promise<unknown>;
  setMedia(productId: string, adminId: string, kind: ProductMediaKind, mediaId: string | null): Promise<unknown>;
}

function adminId(admin: User): string {
  if (!admin._id) throw new InternalServerError();
  return admin._id.toString();
}

export function createProductMediaRouteHandlers(options: { authorize?: () => Promise<User>; services?: Partial<ProductMediaRouteServices> } = {}) {
  const services: ProductMediaRouteServices = { beginUpload: beginProductMediaUpload, completeUpload: completeProductMediaUpload, list: listProductMedia, setMedia: setProductMedia, ...options.services };
  const withAdmin = createAdminApiWrapper(options.authorize);

  const GET = withAdmin<ProductContext>(async (_request, admin, context) => {
    const { id } = await context.params;
    return createJsonResponse({ success: true, data: await services.list(id, adminId(admin)) });
  });
  const PATCH = withAdmin<ProductContext>(async (request, admin, context) => {
    const { id } = await context.params;
    const raw = await readJsonBody(request);
    if (!raw || typeof raw !== "object") throw new ValidationError([{ field: "media", message: "Media selection details are invalid." }]);
    const body = raw as { kind?: unknown; mediaId?: unknown };
    if ((body.kind !== "thumbnail" && body.kind !== "promotional_video") || (body.mediaId !== null && typeof body.mediaId !== "string")) {
      throw new ValidationError([{ field: "media", message: "Media selection details are invalid." }]);
    }
    return createJsonResponse({ success: true, data: await services.setMedia(id, adminId(admin), body.kind, body.mediaId) });
  });
  const uploadPOST = withAdmin<ProductContext>(async (request, admin, context) => {
    const { id } = await context.params;
    const data = await services.beginUpload(id, adminId(admin), await readJsonBody(request));
    return createJsonResponse({ success: true, data });
  });
  const completePOST = withAdmin<MediaContext>(async (_request, admin, context) => {
    const { id, mediaId } = await context.params;
    const data = await services.completeUpload(id, mediaId, adminId(admin));
    return createJsonResponse({ success: true, data });
  });
  return { GET, PATCH, uploadPOST, completePOST };
}

const handlers = createProductMediaRouteHandlers();
export const productMediaHandlers = { GET: handlers.GET, PATCH: handlers.PATCH, uploadPOST: handlers.uploadPOST, completePOST: handlers.completePOST };
