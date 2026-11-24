import { listSupport } from "@/lib/support";
import { supportCategories } from "@/lib/db/models/support";
export async function GET(request: Request) {
  const url = new URL(request.url);
  const status = url.searchParams.get("status") || undefined;
  const category = url.searchParams.get("category") || undefined;
  const search = url.searchParams.get("search")?.slice(0, 320);
  const page = Number(url.searchParams.get("page") || 1);
  if (status && !["new","in_progress","resolved","closed"].includes(status)) return Response.json({ error: "Invalid filter." }, { status: 400 });
  if (category && !supportCategories.includes(category as typeof supportCategories[number])) return Response.json({ error: "Invalid filter." }, { status: 400 });
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000) return Response.json({ error: "Invalid page." }, { status: 400 });
  try {
    return Response.json(await listSupport({ status: status as "new" | "in_progress" | "resolved" | "closed" | undefined, category, search, page }), { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "Unable to load support requests." }, { status: 403 }); }
}
