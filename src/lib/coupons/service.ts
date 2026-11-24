import "server-only";
import { z } from "zod";
import { connectToDatabase } from "@/lib/db/mongodb";
import { CouponModel, CouponRedemptionModel, ProductModel } from "@/lib/db/models";
import { requireAdmin } from "@/lib/auth/admin";
import { cartSchema } from "@/lib/cart/cart";
import { priceCouponPreview } from "./preview-pricing";

export const couponInput = z.object({
 code:z.string().trim().min(3).max(64).regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/).transform(v=>v.toUpperCase()),
 discountType:z.enum(["fixed","percentage"]), discountValue:z.number().int().positive(),
 minimumOrderPaise:z.number().int().nonnegative().default(0), maximumDiscountPaise:z.number().int().positive().optional(),
 validFrom:z.iso.datetime().transform(v=>new Date(v)), validUntil:z.iso.datetime().transform(v=>new Date(v)),
 totalRedemptionLimit:z.number().int().positive().optional(), status:z.enum(["active","inactive","archived"]).default("inactive"),
}).strict().refine(v=>v.validUntil>v.validFrom).refine(v=>v.discountType!=="percentage"||v.discountValue<=10000).refine(v=>v.discountType!=="fixed"||!v.maximumDiscountPaise);
export async function previewCoupon(code:string, items:unknown) {
 const cart=cartSchema.parse(items);
 if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(code.trim())) throw new Error("This coupon is not valid for your cart.");
 await connectToDatabase();
 const now=new Date(), coupon=await CouponModel.findOne({code:code.trim().toUpperCase(),status:"active",validFrom:{$lte:now},validUntil:{$gt:now}}).lean();
 if(!coupon) throw new Error("This coupon is not valid for your cart.");
 const ids=cart.map(item=>item.productId);
 const products=await ProductModel.find({_id:{$in:ids},publicationStatus:"published"}).select("_id pricePaise categoryIds productType").lean();
 if(products.length!==ids.length || products.some(product=>!['pdf','pdf_bundle','call_guidance'].includes(product.productType))) throw new Error("One or more cart items are no longer available.");
 const quote=priceCouponPreview(cart,products,coupon);
 const totalUses=await CouponRedemptionModel.countDocuments({couponId:coupon._id,$or:[{status:"redeemed"},{status:"reserved",reservationExpiresAt:{$gt:now}}]});
 if(coupon.totalRedemptionLimit!==undefined&&totalUses>=coupon.totalRedemptionLimit) throw new Error("This coupon has reached its usage limit.");
 return {code:coupon.code,...quote};
}
export async function adminCoupons() {
 await requireAdmin(); await connectToDatabase();
 const coupons=await CouponModel.find({status:{$ne:"archived"}}).sort({createdAt:-1}).limit(100).lean();
 return Promise.all(coupons.map(async c=>({...c,_id:String(c._id),uses:await CouponRedemptionModel.countDocuments({couponId:c._id,status:"redeemed"})})));
}
export async function saveCoupon(input:unknown,id?:string) {
 const admin=await requireAdmin(); const data=couponInput.parse(input); await connectToDatabase();
 if(id) {
  const c=await CouponModel.findByIdAndUpdate(id,{$set:data},{new:true,runValidators:true});
  if(!c) throw new Error("Coupon not found"); return c;
 }
 return CouponModel.create({...data,createdBy:admin._id});
}
export async function deactivateCoupon(id:string) {
 await requireAdmin(); await connectToDatabase();
 const c=await CouponModel.findByIdAndUpdate(id,{$set:{status:"inactive"}},{new:true});
 if(!c) throw new Error("Coupon not found"); return c;
}

