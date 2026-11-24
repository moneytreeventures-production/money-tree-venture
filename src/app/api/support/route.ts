import { isTrustedMutationOrigin } from "@/lib/http/mutation-origin";
import { ZodError } from "zod";
import { submitSupport } from "@/lib/support";
export async function POST(request: Request) {
  if (!isTrustedMutationOrigin(request)) return Response.json({ error: "Invalid origin." }, { status: 403 });
  if (Number(request.headers.get("content-length")) > 8192) return Response.json({ error: "Request too large." }, { status: 413 });
  try {
    const text = await request.text();
    if (text.length > 8192) return Response.json({ error: "Request too large." }, { status: 413 });
    const result = await submitSupport(JSON.parse(text));
    return Response.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) return Response.json({ error: "Check the form fields.", fields: error.issues.map((issue) => issue.path[0]) }, { status: 400 });
    if (error instanceof SyntaxError) return Response.json({ error: "Invalid request." }, { status: 400 });
    if (error instanceof Error && error.message.startsWith("Too many requests")) return Response.json({ error: error.message }, { status: 429 });
    return Response.json({ error: "Your request could not be saved. Please try again." }, { status: 503 });
  }
}
