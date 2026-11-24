
import { NextRequest } from "next/server";

import { createErrorResponse } from "@/lib/errors/response";
import { createJsonResponse } from "@/lib/http/response";
import { resolveRequestId } from "@/lib/http/request-id";
import { listCategories } from "@/lib/catalog/category-service";

export async function GET(request: NextRequest): Promise<Response> {
  const requestId = resolveRequestId(request);

  try {
    const page = request.nextUrl.searchParams.get("page") ?? "1";
    const pageSize = request.nextUrl.searchParams.get("pageSize") ?? "20";

    const result = await listCategories({
      status: "active",
      page,
      pageSize,
    });

    return createJsonResponse(
      { success: true, data: result },
      requestId,
    );
  } catch (error) {
    return createErrorResponse(error, requestId);
  }
}
