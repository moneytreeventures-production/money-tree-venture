import { withAdmin } from "@/lib/auth/admin-api";
import { listProductAssets, uploadProductPdf } from "@/lib/catalog/product-asset-service";
import { ValidationError } from "@/lib/errors/app-error";
import { getR2Configuration } from "@/lib/storage/config";
import { createJsonResponse } from "@/lib/http/response";

type Context = { params: Promise<{ id: string }> };

async function readMultipartRequest(request: Request, maximumBytes: number): Promise<Request> {
  const declared = request.headers.get("content-length");
  const maxBody = maximumBytes + 1024 * 1024;
  if (declared && Number(declared) > maxBody) {
    await request.body?.cancel().catch(() => undefined);
    throw new ValidationError([{ field: "file", message: "PDF file configured limit se badi hai." }]);
  }
  const reader = request.body?.getReader();
  if (!reader) throw new ValidationError([{ field: "file", message: "PDF file attach karein." }]);
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBody) {
      await reader.cancel().catch(() => undefined);
      throw new ValidationError([{ field: "file", message: "PDF file configured limit se badi hai." }]);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new Request(request.url, { method: request.method, headers: request.headers, body: bytes });
}

export const GET = withAdmin<Context>(async (_request, _admin, context) => {
  const { id } = await context.params;
  return createJsonResponse({ success: true, data: await listProductAssets(id) });
});

export const POST = withAdmin<Context>(async (request, admin, context) => {
  const { id } = await context.params;
  const config = getR2Configuration();
  const boundedRequest = await readMultipartRequest(request, config.maxUploadBytes);
  const form = await boundedRequest.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new ValidationError([{ field: "file", message: "PDF file attach karein." }]);
  if (!admin._id) throw new ValidationError([{ field: "admin", message: "Admin identity available nahi hai." }]);
  const data = await uploadProductPdf(id, file, admin._id.toString());
  return createJsonResponse({ success: true, data }, undefined, { status: 201 });
});
