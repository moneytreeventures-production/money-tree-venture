export type PaymentResultState = "success" | "failed" | "processing";

export function paymentResultState(order: { orderStatus?: string; paymentStatus?: string }): PaymentResultState {
  if (order.orderStatus === "paid" && order.paymentStatus === "paid") return "success";
  if (order.orderStatus === "expired" && order.paymentStatus === "failed") return "failed";
  return "processing";
}

export function paymentResultDestinations(lines: readonly { productType: string }[]) {
  return {
    library: lines.some((line) => line.productType === "pdf" || line.productType === "pdf_bundle"),
    bookings: lines.some((line) => line.productType === "call_guidance"),
  };
}
