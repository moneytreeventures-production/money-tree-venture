import { isTrustedMutationOrigin } from "@/lib/http/mutation-origin";
import { moderateReview } from "@/lib/reviews";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    if (!isTrustedMutationOrigin(request)) return Response.json({ error: "Invalid origin." }, { status: 403 });
    const { id } = await context.params;
    const body = await request.json();
    if (body.status !== "approved" && body.status !== "rejected") return Response.json({ error: "Invalid status." }, { status: 400 });
    return Response.json(await moderateReview(id, body.status));
  } catch { return Response.json({ error: "Unable to moderate review." }, { status: 403 }); }
}
