import { isTrustedMutationOrigin } from "@/lib/http/mutation-origin";
import { ZodError } from "zod";
import { previewCoupon } from "@/lib/coupons/service";
import { couponPreviewRequestSchema } from "@/lib/coupons/preview-pricing";
export async function POST(request:Request) {
 try {
  if(!isTrustedMutationOrigin(request)) return Response.json({error:"Invalid origin"},{status:403});
  const b=couponPreviewRequestSchema.parse(await request.json());
  return Response.json(await previewCoupon(b.code,b.items),{headers:{"Cache-Control":"no-store"}});
 } catch (error) {
  const message = error instanceof Error ? error.message : "";
  const safeMessages = new Set([
   "This coupon is not valid for your cart.", "One or more cart items are no longer available.",
   "Cart total is outside the supported range.", "This coupon needs a higher cart value.",
   "This coupon does not apply to the products in your cart.", "The coupon cannot reduce the order total to zero.",
   "This coupon has reached its usage limit.", "Only one 1:1 Call Guidance session can be purchased per order.",
  ]);
  if (safeMessages.has(message)) return Response.json({error:message},{status:400});
  if (error instanceof ZodError) return Response.json({error:"Check the coupon code and cart items, then try again."},{status:400});
  return Response.json({error:"Coupon preview is temporarily unavailable. No discount has been applied."},{status:503,headers:{"Cache-Control":"no-store"}});
 }
}
