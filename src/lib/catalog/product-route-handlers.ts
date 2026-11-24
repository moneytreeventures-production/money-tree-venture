import "server-only";

import { createAdminApiWrapper } from "../auth/admin-api";
import { InternalServerError } from "../errors/app-error";
import { createErrorResponse } from "../errors/response";
import { readJsonBody } from "./route-utils";
import { createJsonResponse } from "../http/response";
import { resolveRequestId } from "../http/request-id";
import type { User } from "../db/models/user";
import {
  changeProductStatus,
  createProduct,
  deleteProduct,
  getProductById,
  getPublicProductBySlug,
  listProducts,
  listPublicProducts,
  updateProduct,
} from "./product-service";
import { toPublicProductView } from "./product-view";

type ProductRouteContext = { params: Promise<{ id: string }> };
type ProductSlugRouteContext = { params: Promise<{ slug: string }> };

export interface ProductRouteServices {
  createProduct(input: unknown, adminUserId: string): Promise<unknown>;
  updateProduct(id: string, input: unknown, adminUserId: string): Promise<unknown>;
  changeProductStatus(id: string, input: unknown, adminUserId: string): Promise<unknown>;
  deleteProduct(id: string, adminUserId: string): Promise<void>;
  getProductById(id: string): Promise<unknown>;
  listProducts(input: unknown): Promise<unknown>;
  listPublicProducts(input: unknown): Promise<{ items: Array<Parameters<typeof toPublicProductView>[0]>; pagination: unknown }>;
  getPublicProductBySlug(slug: string): Promise<Parameters<typeof toPublicProductView>[0]>;
}

function getAdminId(admin: User): string {
  if (!admin._id) throw new InternalServerError();
  return admin._id.toString();
}

function readQuery(request: Request): Record<string, string> {
  return Object.fromEntries(new URL(request.url).searchParams.entries());
}

export function createProductRouteHandlers(options: {
  authorize?: () => Promise<User>;
  services?: Partial<ProductRouteServices>;
} = {}) {
  const services: ProductRouteServices = {
    createProduct,
    deleteProduct,
    updateProduct,
    changeProductStatus,
    getProductById,
    listProducts,
    listPublicProducts,
    getPublicProductBySlug,
    ...options.services,
  };
  const withAdmin = createAdminApiWrapper(options.authorize);

  const adminCollectionGET = withAdmin(async (request) => {
    const result = await services.listProducts(readQuery(request));
    return createJsonResponse({ success: true, data: result });
  });

  const adminCollectionPOST = withAdmin(async (request, admin) => {
    const product = await services.createProduct(await readJsonBody(request), getAdminId(admin));
    return createJsonResponse({ success: true, data: product }, undefined, { status: 201 });
  });

  const adminItemGET = withAdmin<ProductRouteContext>(async (_request, _admin, context) => {
    const { id } = await context.params;
    const product = await services.getProductById(id);
    return createJsonResponse({ success: true, data: product });
  });

  const adminItemPATCH = withAdmin<ProductRouteContext>(async (request, admin, context) => {
    const { id } = await context.params;
    const product = await services.updateProduct(id, await readJsonBody(request), getAdminId(admin));
    return createJsonResponse({ success: true, data: product });
  });

  const adminItemDELETE = withAdmin<ProductRouteContext>(async (_request, admin, context) => {
    const { id } = await context.params;
    await services.deleteProduct(id, getAdminId(admin));
    return createJsonResponse({ success: true, data: { deleted: true } });
  });

  const adminStatusPATCH = withAdmin<ProductRouteContext>(async (request, admin, context) => {
    const { id } = await context.params;
    const product = await services.changeProductStatus(id, await readJsonBody(request), getAdminId(admin));
    return createJsonResponse({ success: true, data: product });
  });

  const publicListGET = async (request: Request): Promise<Response> => {
    const requestId = resolveRequestId(request);
    try {
      const result = await services.listPublicProducts(readQuery(request));
      return createJsonResponse({
        success: true,
        data: { ...result, items: result.items.map(toPublicProductView) },
      }, requestId);
    } catch (error) {
      return createErrorResponse(error, requestId);
    }
  };

  const publicItemGET = async (_request: Request, context: ProductSlugRouteContext): Promise<Response> => {
    const requestId = resolveRequestId(_request);
    try {
      const { slug } = await context.params;
      const product = await services.getPublicProductBySlug(slug);
      return createJsonResponse({ success: true, data: toPublicProductView(product) }, requestId);
    } catch (error) {
      return createErrorResponse(error, requestId);
    }
  };

  return { adminCollectionGET, adminCollectionPOST, adminItemGET, adminItemPATCH, adminItemDELETE, adminStatusPATCH, publicListGET, publicItemGET };
}

const handlers = createProductRouteHandlers();

export const adminProductHandlers = {
  GET: handlers.adminCollectionGET,
  POST: handlers.adminCollectionPOST,
  itemGET: handlers.adminItemGET,
  itemPATCH: handlers.adminItemPATCH,
  itemDELETE: handlers.adminItemDELETE,
  statusPATCH: handlers.adminStatusPATCH,
};

export const publicProductHandlers = {
  GET: handlers.publicListGET,
  itemGET: handlers.publicItemGET,
};
