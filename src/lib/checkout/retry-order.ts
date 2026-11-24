export function canRetryExpiredOrder(order: { orderStatus?: string; paymentStatus?: string }): boolean {
  return order.orderStatus === "expired" && order.paymentStatus === "failed";
}

/** A new checkout uses only public product IDs; every price is recalculated server-side. */
export function retryOrderProductIds(lines: readonly { productId?: string }[] | undefined): string[] | null {
  const ids = lines?.map((line) => line.productId ?? "") ?? [];
  if (ids.length < 1 || ids.length > 3 || new Set(ids).size !== ids.length || ids.some((id) => !/^[a-f0-9]{24}$/i.test(id))) return null;
  return ids;
}
