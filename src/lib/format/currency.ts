export function formatINR(pricePaise: number): string {
  if (!Number.isSafeInteger(pricePaise) || pricePaise < 0) throw new RangeError("INR amount must be a non-negative integer number of paise.");
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(pricePaise / 100);
}
