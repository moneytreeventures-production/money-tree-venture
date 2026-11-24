import { priceOrder } from "../checkout/pricing";
import { isOrderQuantityAllowed, type PurchasableProductType } from "../checkout/order-rules";
import { z } from "zod";

export const couponPreviewRequestSchema = z.object({
  code: z.string().trim().min(3).max(64),
  items: z.array(z.object({ productId: z.string().regex(/^[a-f0-9]{24}$/i), quantity: z.number().int().min(1).max(10) }).strict()).min(1).max(50),
}).strict();

export function isCouponQuoteCurrent<T extends { cartKey: string }>(quote: T | null, cartKey: string): quote is T {
  return quote !== null && quote.cartKey === cartKey;
}

export function canCommitCouponPreview(signal: Pick<AbortSignal, "aborted">, requestCartKey: string, currentCartKey: string): boolean {
  return !signal.aborted && requestCartKey === currentCartKey;
}

export interface CouponPreviewItem { productId: string; quantity: number }
export interface CouponPreviewProduct { _id: { toString(): string }; pricePaise: number; productType?: string; categoryIds: Array<{ toString(): string }> }
export interface CouponPreviewRules {
  discountType: "fixed" | "percentage"; discountValue: number; maximumDiscountPaise?: number;
  minimumOrderPaise: number; allowedProductIds: Array<{ toString(): string }>;
  allowedCategoryIds: Array<{ toString(): string }>;
}

export function applyCouponProductRestrictions<T extends { productId: { toString(): string }; categoryIds: Array<{ toString(): string }>; discountEligible: boolean }>(lines: T[], coupon: Pick<CouponPreviewRules, "allowedProductIds" | "allowedCategoryIds">) {
  const productRestrictions = new Set(coupon.allowedProductIds.map((id) => id.toString().toLowerCase()));
  const categoryRestrictions = new Set(coupon.allowedCategoryIds.map((id) => id.toString().toLowerCase()));
  const restricted = productRestrictions.size > 0 || categoryRestrictions.size > 0;
  return lines.map((line) => {
    const productAllowed = productRestrictions.has(line.productId.toString().toLowerCase());
    const categoryAllowed = line.categoryIds.some((id) => categoryRestrictions.has(id.toString().toLowerCase()));
    return { ...line, discountEligible: line.discountEligible && (!restricted || productAllowed || categoryAllowed) };
  });
}

/** Price a cart from canonical product records with the same eligibility and paise rules as checkout. */
export function priceCouponPreview(items: CouponPreviewItem[], products: CouponPreviewProduct[], coupon: CouponPreviewRules) {
  const byId = new Map(products.map((product) => [product._id.toString().toLowerCase(), product]));
  const productIds = new Set(products.map((product) => product._id.toString().toLowerCase()));
  if (items.some((item) => !productIds.has(item.productId.toLowerCase()))) throw new Error("One or more cart items are no longer available.");
  if (items.some((item) => {
    const productType = byId.get(item.productId.toLowerCase())?.productType;
    return productType !== undefined && !isOrderQuantityAllowed(productType as PurchasableProductType, item.quantity);
  })) {
    throw new Error("Only one 1:1 Call Guidance session can be purchased per order.");
  }

  const subtotalPaise = items.reduce((sum, item) => {
    const product = byId.get(item.productId.toLowerCase())!;
    const lineTotal = product.pricePaise * item.quantity;
    if (!Number.isSafeInteger(lineTotal) || !Number.isSafeInteger(sum + lineTotal)) throw new Error("Cart total is outside the supported range.");
    return sum + lineTotal;
  }, 0);
  if (subtotalPaise < coupon.minimumOrderPaise) throw new Error("This coupon needs a higher cart value.");

  const baseLines = items.map((item) => {
    const product = byId.get(item.productId.toLowerCase())!;
    const lineSubtotalPaise = product.pricePaise * item.quantity;
    return { productId: product._id, categoryIds: product.categoryIds, lineSubtotalPaise, discountEligible: true };
  });
  const lines = applyCouponProductRestrictions(baseLines, coupon);
  if (!lines.some((line) => line.discountEligible)) throw new Error("This coupon does not apply to the products in your cart.");

  const priced = priceOrder(lines, {
    type: coupon.discountType,
    value: coupon.discountValue,
    ...(coupon.maximumDiscountPaise !== undefined ? { maximumDiscountPaise: coupon.maximumDiscountPaise } : {}),
  }, 0);
  const discountPaise = priced.reduce((sum, line) => sum + line.discountPaise, 0);
  const payablePaise = subtotalPaise - discountPaise;
  if (payablePaise <= 0) throw new Error("The coupon cannot reduce the order total to zero.");
  return { subtotalPaise, discountPaise, payablePaise };
}
