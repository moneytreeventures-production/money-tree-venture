import { isTrustedMutationOrigin } from "@/lib/http/mutation-origin";
import { getSupport, updateSupport } from "@/lib/support";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try { return Response.json(await getSupport((await context.params).id), { headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ error: "Request unavailable." }, { status: 403 }); }
}
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isTrustedMutationOrigin(request)) return Response.json({ error: "Invalid origin." }, { status: 403 });
  try { return Response.json(await updateSupport((await context.params).id, await request.json())); }
  catch { return Response.json({ error: "Update failed." }, { status: 403 }); }
}
