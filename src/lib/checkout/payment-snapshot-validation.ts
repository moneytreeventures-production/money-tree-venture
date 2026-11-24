export interface PaymentSnapshotLine {
  quantity: number;
  unitPricePaise: number;
  lineSubtotalPaise: number;
  discountPaise: number;
  taxPaise: number;
  lineTotalPaise: number;
}

export interface PaymentSnapshot {
  currency: unknown;
  subtotalPaise: unknown;
  discountPaise: unknown;
  taxPaise: unknown;
  totalPaise: unknown;
  taxSnapshot?: { rateBasisPoints?: unknown; calculationVersion?: unknown };
  lines?: PaymentSnapshotLine[];
}

export function paymentSnapshotIssues(snapshot: PaymentSnapshot): string[] {
  const issues: string[] = [];
  const paiseFields = ["subtotalPaise", "discountPaise", "taxPaise", "totalPaise"] as const;
  for (const field of paiseFields) {
    const value = snapshot[field];
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) issues.push(field);
  }
  if (snapshot.currency !== "INR") issues.push("currency");
  if (!Array.isArray(snapshot.lines) || snapshot.lines.length === 0) issues.push("lines");
  const lines = Array.isArray(snapshot.lines) ? snapshot.lines : [];
  let subtotal = 0;
  let discount = 0;
  let tax = 0;
  let total = 0;
  const rate = snapshot.taxSnapshot?.rateBasisPoints;
  if (typeof rate !== "number" || !Number.isSafeInteger(rate) || rate < 0 || rate > 10_000) issues.push("taxSnapshot.rateBasisPoints");
  if (typeof snapshot.taxSnapshot?.calculationVersion !== "string" || !snapshot.taxSnapshot.calculationVersion) issues.push("taxSnapshot.calculationVersion");

  lines.forEach((line, index) => {
    const fields = ["quantity", "unitPricePaise", "lineSubtotalPaise", "discountPaise", "taxPaise", "lineTotalPaise"] as const;
    for (const field of fields) {
      if (!Number.isSafeInteger(line[field]) || line[field] < 0) issues.push(`lines.${index}.${field}`);
    }
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.lineSubtotalPaise !== line.unitPricePaise * line.quantity) issues.push(`lines.${index}.lineSubtotalPaise`);
    if (line.discountPaise > line.lineSubtotalPaise || line.lineTotalPaise !== line.lineSubtotalPaise - line.discountPaise) issues.push(`lines.${index}.lineTotalPaise`);
    if (line.taxPaise > line.lineTotalPaise) issues.push(`lines.${index}.taxPaise`);
    if (typeof rate === "number" && Number.isSafeInteger(rate) && rate >= 0 && rate <= 10_000 && Number.isSafeInteger(line.lineTotalPaise) && line.lineTotalPaise >= 0) {
      const denominator = BigInt(10_000 + rate);
      const expectedTax = Number((BigInt(line.lineTotalPaise) * BigInt(rate) + denominator / BigInt(2)) / denominator);
      if (line.taxPaise !== expectedTax) issues.push(`lines.${index}.taxPaise`);
    }
    subtotal += line.lineSubtotalPaise;
    discount += line.discountPaise;
    tax += line.taxPaise;
    total += line.lineTotalPaise;
  });
  if (snapshot.subtotalPaise !== subtotal) issues.push("subtotalPaise");
  if (snapshot.discountPaise !== discount) issues.push("discountPaise");
  if (snapshot.taxPaise !== tax) issues.push("taxPaise");
  if (snapshot.totalPaise !== total || total !== subtotal - discount) issues.push("totalPaise");
  if (tax > total) issues.push("taxPaise");
  return [...new Set(issues)];
}
