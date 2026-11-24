import assert from "node:assert/strict";
import { test } from "node:test";
import { addCartItem, cartSchema, clearGuestCart, mergeCarts, readGuestCart, writeGuestCart } from "../../src/lib/cart/cart";

const id1 = "64b64c000000000000000001";
const id2 = "64b64c000000000000000002";

test("cart contains unique product identifiers and quantities only", () => {
  assert.equal(cartSchema.safeParse([{ productId: id1, quantity: 2 }]).success, false);
  assert.equal(cartSchema.safeParse([{ productId: id1, quantity: 1, pricePaise: 100 }]).success, false);
  assert.equal(cartSchema.safeParse([{ productId: id1, quantity: 1 }, { productId: id1.toUpperCase(), quantity: 1 }]).success, false);
});

test("guest cart restoration merges by product identity without trusting prices", () => {
  assert.deepEqual(mergeCarts([{ productId: id1, quantity: 1 }], [{ productId: id2, quantity: 1 }]), [
    { productId: id2, quantity: 1 }, { productId: id1, quantity: 1 },
  ]);
});

test("repeated adds preserve one license and enforce limits", () => {
  const first = addCartItem([], id1);
  const second = addCartItem(first.cart, id1, 1);
  assert.equal(first.added, true);
  assert.equal(second.added, false);
  assert.deepEqual(second.cart, [{ productId: id1, quantity: 1 }]);

  const capped = addCartItem(second.cart, id1, 20);
  assert.deepEqual(capped.cart, [{ productId: id1, quantity: 1 }]);
  assert.equal(addCartItem(capped.cart, id1).added, false);

  const fifty = Array.from({ length: 50 }, (_, index) => ({ productId: index.toString(16).padStart(24, "0"), quantity: 1 }));
  assert.equal(addCartItem(fifty, "f".repeat(24)).added, false);
  assert.equal(addCartItem([], id2, Number.NaN).added, false);
});

test("guest cart storage tolerates corrupt data and supports writes and clearing", () => {
  let value: string | null = "not-json";
  const storage = {
    getItem() { return value; },
    setItem(_key: string, next: string) { value = next; },
    removeItem() { value = null; },
  };
  assert.deepEqual(readGuestCart(storage), []);
  writeGuestCart([{ productId: id1, quantity: 1 }], storage);
  assert.deepEqual(readGuestCart(storage), [{ productId: id1, quantity: 1 }]);
  clearGuestCart(storage);
  assert.equal(value, null);
});

test("guest cart remains usable when browser storage is unavailable", () => {
  const unavailable = {
    getItem() { throw new Error("storage blocked"); },
    setItem() { throw new Error("quota exceeded"); },
    removeItem() { throw new Error("storage blocked"); },
  };
  assert.deepEqual(readGuestCart(unavailable), []);
  assert.deepEqual(writeGuestCart([{ productId: id1, quantity: 1 }], unavailable), [{ productId: id1, quantity: 1 }]);
  assert.doesNotThrow(() => clearGuestCart(unavailable));
});
