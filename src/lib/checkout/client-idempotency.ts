import type { Cart } from "../cart/cart";

const STORAGE_KEY = "moneytree:checkout-attempt:v1";

interface CheckoutAttempt {
  signature: string;
  key: string;
}
interface SessionStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Browser checkout submits identifiers and quantities only; the server sets every amount. */
export function checkoutOrderRequest(items: Cart, couponCode: string, repurchaseProductIds: string[] = []) {
  return {
    items: items.map(({ productId, quantity }) => ({ productId, quantity })),
    ...(couponCode.trim() ? { couponCode: couponCode.trim() } : {}),
    ...(repurchaseProductIds.length ? { repurchaseProductIds: [...repurchaseProductIds].map((id) => id.toLowerCase()).sort() } : {}),
  };
}

export function checkoutSignature(items: Cart, couponCode: string, repurchaseProductIds: string[] = []): string {
  return JSON.stringify({
    items: items.map((item) => ({ productId: item.productId.toLowerCase(), quantity: item.quantity })),
    couponCode: couponCode.trim().toUpperCase() || null,
    repurchaseProductIds: [...repurchaseProductIds].map((id) => id.toLowerCase()).sort(),
  });
}

export function getCheckoutIdempotencyKey(
  signature: string,
  storage: SessionStorageLike = sessionStorage,
  createKey: () => string = () => crypto.randomUUID(),
): string {
  try {
    const existing = storage.getItem(STORAGE_KEY);
    if (existing) {
      const parsed = JSON.parse(existing) as Partial<CheckoutAttempt>;
      if (parsed.signature === signature && typeof parsed.key === "string" && /^[A-Za-z0-9_-]{16,128}$/.test(parsed.key)) {
        return parsed.key;
      }
    }
  } catch {
    // If session storage is unavailable, still create an attempt key for this request.
  }

  const key = createKey();
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ signature, key } satisfies CheckoutAttempt));
  } catch {
    // The key remains usable for retries during the current page session.
  }
  return key;
}

export function clearCheckoutIdempotencyKey(
  signature: string,
  storage: SessionStorageLike = sessionStorage,
): void {
  try {
    const existing = storage.getItem(STORAGE_KEY);
    if (!existing) return;
    const parsed = JSON.parse(existing) as Partial<CheckoutAttempt>;
    if (parsed.signature === signature) storage.removeItem(STORAGE_KEY);
  } catch {
    // Storage cleanup is best-effort and does not affect order correctness.
  }
}
