import { isTrustedMutationOrigin } from "@/lib/http/mutation-origin";
import { ApplicationError } from "@/lib/errors/app-error";
import { ZodError } from "zod";
import { submitReview } from "@/lib/reviews";
export async function POST(request: Request) {
  try {
    if (!isTrustedMutationOrigin(request)) return Response.json({ error: "Invalid origin." }, { status: 403 });
    const body = await request.json();
    if (JSON.stringify(body).length > 5000) return Response.json({ error: "Review too long." }, { status: 413 });
    const result = await submitReview(body.productId, { rating: body.rating, title: body.title, text: body.text });
    return Response.json({ id: String(result._id), status: "pending" }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = error instanceof ApplicationError ? error.statusCode : error instanceof ZodError ? 400 : message.includes("already") ? 409 : message.includes("purchase") ? 403 : 500;
    return Response.json({ error: status === 500 ? "Review could not be submitted." : error instanceof ApplicationError ? "Please sign in to review this product." : message || "Review could not be submitted." }, { status });
  }
}
