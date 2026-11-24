import { ValidationError } from "../errors/app-error";

export interface PriceLine { lineSubtotalPaise: number; discountEligible: boolean }
export interface PricedLine extends PriceLine { discountPaise: number; lineTotalPaise: number; taxPaise: number }

function safeMoney(value: bigint): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) throw new ValidationError([{ field: "total", message: "Order amount is outside the supported range." }]);
  return result;
}

/** Compute deterministic discount allocation and inclusive tax in integer paise. */
export function priceOrder(lines: PriceLine[], coupon: { type: "fixed" | "percentage"; value: number; maximumDiscountPaise?: number } | undefined, taxRateBps: number): PricedLine[] {
  if (!Number.isSafeInteger(taxRateBps) || taxRateBps < 0 || taxRateBps > 10_000) {
    throw new ValidationError([{ field: "taxRateBps", message: "Tax configuration is invalid." }]);
  }
  const eligibleTotal = lines.reduce((sum, line) => sum + (line.discountEligible ? line.lineSubtotalPaise : 0), 0);
  let remainingDiscount = 0;
  if (coupon && coupon.type === "fixed") remainingDiscount = Math.min(eligibleTotal, coupon.value);
  if (coupon && coupon.type === "percentage") {
    remainingDiscount = safeMoney(BigInt(eligibleTotal) * BigInt(coupon.value) / BigInt(10_000));
    if (coupon.maximumDiscountPaise !== undefined) remainingDiscount = Math.min(remainingDiscount, coupon.maximumDiscountPaise);
  }

  const discounts = lines.map((line) => {
    if (!line.discountEligible || remainingDiscount === 0) return 0;
    const discount = Math.min(line.lineSubtotalPaise, remainingDiscount);
    remainingDiscount -= discount;
    return discount;
  });

  return lines.map((line, index) => {
    const discountPaise = discounts[index] ?? 0;
    const lineTotalPaise = line.lineSubtotalPaise - discountPaise;
    const denominator = BigInt(10_000 + taxRateBps);
    const taxPaise = safeMoney((BigInt(lineTotalPaise) * BigInt(taxRateBps) + denominator / BigInt(2)) / denominator);
    return { ...line, discountPaise, lineTotalPaise, taxPaise };
  });
}
