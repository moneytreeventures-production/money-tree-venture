export type PurchasableProductType = "pdf" | "pdf_bundle" | "call_guidance";

/** Each Call Guidance line creates one booking entitlement, so it is limited to quantity one. */
export function isOrderQuantityAllowed(productType: PurchasableProductType, quantity: number): boolean {
  return Number.isSafeInteger(quantity) && quantity === 1;
}
