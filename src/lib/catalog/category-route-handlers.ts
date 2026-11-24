import "server-only";

import type { User } from "../db/models/user";
import { createAdminApiWrapper } from "../auth/admin-api";
import { createJsonResponse } from "../http/response";
import { readJsonBody } from "./route-utils";
import {
  changeCategoryStatus,
  createCategory,
  listCategories,
  updateCategory,
} from "./category-service";

type CategoryRouteContext = { params: Promise<{ id: string }> };

export interface CategoryRouteServices {
  listCategories(input: unknown): Promise<unknown>;
  createCategory(input: unknown): Promise<unknown>;
  updateCategory(id: string, input: unknown): Promise<unknown>;
  changeCategoryStatus(id: string, input: unknown): Promise<unknown>;
}

function readQuery(request: Request): Record<string, string> {
  return Object.fromEntries(new URL(request.url).searchParams.entries());
}

export function createAdminCategoryRouteHandlers(options: {
  authorize?: () => Promise<User>;
  services?: Partial<CategoryRouteServices>;
} = {}) {
  const services: CategoryRouteServices = {
    listCategories,
    createCategory,
    updateCategory,
    changeCategoryStatus,
    ...options.services,
  };
  const withAdmin = createAdminApiWrapper(options.authorize);

  const collectionGET = withAdmin(async (request) => {
    const result = await services.listCategories(readQuery(request));
    return createJsonResponse({ success: true, data: result });
  });

  const collectionPOST = withAdmin(async (request) => {
    const category = await services.createCategory(await readJsonBody(request));
    return createJsonResponse({ success: true, data: category }, undefined, { status: 201 });
  });

  const itemPATCH = withAdmin<CategoryRouteContext>(async (request, _admin, context) => {
    const { id } = await context.params;
    const category = await services.updateCategory(id, await readJsonBody(request));
    return createJsonResponse({ success: true, data: category });
  });

  const statusPATCH = withAdmin<CategoryRouteContext>(async (request, _admin, context) => {
    const { id } = await context.params;
    const category = await services.changeCategoryStatus(id, await readJsonBody(request));
    return createJsonResponse({ success: true, data: category });
  });

  return { collectionGET, collectionPOST, itemPATCH, statusPATCH };
}

export const adminCategoryHandlers = createAdminCategoryRouteHandlers();
