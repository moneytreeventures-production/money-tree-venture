import { isTrustedMutationOrigin } from "@/lib/http/mutation-origin";
import { adminCoupons, saveCoupon } from "@/lib/coupons/service";
export async function GET() { try { return Response.json({items:await adminCoupons()},{headers:{"Cache-Control":"no-store"}}); } catch { return Response.json({error:"Unable to load coupons."},{status:403}); } }
export async function POST(r:Request) { try { if(!isTrustedMutationOrigin(r))return Response.json({error:"Invalid origin"},{status:403}); return Response.json(await saveCoupon(await r.json()),{status:201}); } catch { return Response.json({error:"Coupon could not be saved."},{status:400}); } }
