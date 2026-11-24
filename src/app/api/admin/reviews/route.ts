import { moderationQueue } from "@/lib/reviews";
export async function GET(request: Request) {
  try {
    const status = new URL(request.url).searchParams.get("status");
    if (status !== "pending" && status !== "approved" && status !== "rejected") return Response.json({ error: "Invalid status." }, { status: 400 });
    return Response.json({ items: await moderationQueue(status) });
  } catch { return Response.json({ error: "Unable to load reviews." }, { status: 403 }); }
}
