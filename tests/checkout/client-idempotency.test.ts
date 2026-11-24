import assert from "node:assert/strict";
import { test } from "node:test";
import { checkoutOrderRequest, checkoutSignature, clearCheckoutIdempotencyKey, getCheckoutIdempotencyKey } from "../../src/lib/checkout/client-idempotency";

test("browser order request sends only product IDs, quantities and an optional coupon", () => {
  const items = [
    { productId: "64b64c000000000000000001", quantity: 1 },
    { productId: "64b64c000000000000000002", quantity: 1 },
  ];
  assert.deepEqual(checkoutOrderRequest(items, " SAVE10 "), { items, couponCode: "SAVE10" });
  assert.deepEqual(checkoutOrderRequest(items, " "), { items });
  assert.deepEqual(checkoutOrderRequest(items, "", [items[1]!.productId]), { items, repurchaseProductIds: [items[1]!.productId] });
});

function storageFake() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

test("checkout signatures normalize coupon casing and bind the cart identity", () => {
  const cart = [{ productId: "64b64c000000000000000010", quantity: 2 }];
  assert.equal(checkoutSignature(cart, "save10"), checkoutSignature(cart, " SAVE10 "));
  assert.notEqual(checkoutSignature(cart, "SAVE10"), checkoutSignature(cart, "SAVE20"));
  assert.notEqual(checkoutSignature(cart, "SAVE10"), checkoutSignature([{ ...cart[0], quantity: 1 }], "SAVE10"));
  assert.notEqual(checkoutSignature(cart, "SAVE10"), checkoutSignature(cart, "SAVE10", [cart[0]!.productId]));
});

test("checkout attempt keys are reused for an identical request and rotated when inputs change", () => {
  const storage = storageFake();
  let created = 0;
  const createKey = () => "attempt-key-" + String(++created).padStart(16, "0");
  const first = getCheckoutIdempotencyKey("cart-a", storage, createKey);
  assert.equal(getCheckoutIdempotencyKey("cart-a", storage, createKey), first);
  const second = getCheckoutIdempotencyKey("cart-b", storage, createKey);
  assert.notEqual(second, first);
  assert.equal(created, 2);
});

test("successful checkout clears only the matching attempt key", () => {
  const storage = storageFake();
  const key = getCheckoutIdempotencyKey("cart-a", storage, () => "attempt-key-00000001");
  clearCheckoutIdempotencyKey("cart-b", storage);
  assert.equal(getCheckoutIdempotencyKey("cart-a", storage, () => "attempt-key-00000002"), key);
  clearCheckoutIdempotencyKey("cart-a", storage);
  assert.equal(getCheckoutIdempotencyKey("cart-a", storage, () => "attempt-key-00000003"), "attempt-key-00000003");
});
