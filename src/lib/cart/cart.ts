import { z } from "zod";

const cartItemSchema = z.object({
  productId: z.string().regex(/^[a-f0-9]{24}$/i),
  quantity: z.number().int().min(1).max(1),
}).strict();

export const cartSchema = z.array(cartItemSchema).min(1).max(50).superRefine((items, context) => {
  const seen = new Set<string>();
  items.forEach((item, index) => {
    const id = item.productId.toLowerCase();
    if (seen.has(id)) context.addIssue({ code: "custom", path: [index, "productId"], message: "A product can appear only once in the cart." });
    seen.add(id);
  });
});

export type CartItem = z.infer<typeof cartItemSchema>;
export type Cart = CartItem[];

/** Add an item without prices or product metadata, enforcing both cart limits. */
export function addCartItem(current: Cart, productId: string, quantity = 1): { cart: Cart; added: boolean } {
  if (!Number.isSafeInteger(quantity) || quantity !== 1) return { cart: current, added: false };
  const normalizedId = productId.toLowerCase();
  if (current.some((item) => item.productId === normalizedId) || current.length >= 50) return { cart: current, added: false };
  return { cart: [...current, { productId: normalizedId, quantity: 1 }], added: true };
}

/** Merge guest cart identifiers after sign-in. Prices and product metadata never live in the cart. */
export function mergeCarts(guest: unknown, customer: unknown): Cart {
  const guestItems = cartSchema.safeParse(guest);
  const customerItems = cartSchema.safeParse(customer);
  const combined = new Map<string, CartItem>();
  for (const item of [...(customerItems.success ? customerItems.data : []), ...(guestItems.success ? guestItems.data : [])]) {
    const productId = item.productId.toLowerCase();
    combined.set(productId, { productId, quantity: 1 });
  }
  return [...combined.values()].slice(0, 50);
}

const STORAGE_KEY = "moneytree:guest-cart:v1";

export function readGuestCart(storage: Pick<Storage, "getItem"> = localStorage): Cart {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = cartSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export function writeGuestCart(cart: unknown, storage: Pick<Storage, "setItem"> = localStorage): Cart {
  const parsed = cartSchema.safeParse(cart);
  if (!parsed.success) return [];
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(parsed.data));
  } catch {
    // Browser storage can be unavailable in private browsing or under quota pressure.
  }
  return parsed.data;
}

export function clearGuestCart(storage: Pick<Storage, "removeItem"> = localStorage): void {
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // Keep in-memory cart state usable if storage access is denied.
  }
}
