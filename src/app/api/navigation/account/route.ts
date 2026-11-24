import { getCurrentAdmin } from "@/lib/auth/admin";

/** This endpoint returns only the trusted navigation decision, never profile data. */
export async function GET(): Promise<Response> {
  try {
    const admin = await getCurrentAdmin();
    return Response.json({ isAdmin: Boolean(admin) }, {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  } catch {
    return Response.json({ isAdmin: false }, {
      status: 503,
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  }
}
