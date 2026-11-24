import { publicReviews } from "@/lib/reviews";
export async function GET(_request: Request, context: { params: Promise<{ productId: string }> }) {
  const { productId } = await context.params;
  return Response.json(await publicReviews(productId));
}
