"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { addCartItem, clearGuestCart, readGuestCart, writeGuestCart } from "@/lib/cart/cart";
import type { Cart } from "@/lib/cart/cart";

import { CartDrawer } from "./cart-drawer";
import { usePathname } from "next/navigation";

interface CartContextValue {
  openCart(): void;
  items: Cart;
  count: number;
  ready: boolean;
  addItem(productId: string, quantity?: number): boolean;
  setQuantity(productId: string, quantity: number): void;
  removeItem(productId: string): void;
  clearCart(): void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const openCart = useCallback(() => setOpenedAt(pathname), [pathname]);
  useEffect(() => {
    // Navigation must also clear the old route, so Back cannot reopen the drawer.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpenedAt(null);
  }, [pathname]);
  const [items, setItems] = useState<Cart>([]);
  const [ready, setReady] = useState(false);
  const itemsRef = useRef<Cart>([]);

  const updateItems = useCallback((update: (current: Cart) => Cart) => {
    const next = update(itemsRef.current);
    itemsRef.current = next;
    setItems(next);
  }, []);

  useEffect(() => {
    // localStorage is browser-only; hydrate after mount to keep server and first client render identical.
    const stored = readGuestCart();
    itemsRef.current = stored;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItems(stored);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (items.length > 0) writeGuestCart(items);
    else clearGuestCart();
  }, [items, ready]);

  const addItem = useCallback((productId: string, quantity = 1): boolean => {
    if (!ready) return false;
    const result = addCartItem(itemsRef.current, productId, quantity);
    if (!result.added) return false;
    itemsRef.current = result.cart;
    setItems(result.cart);
    openCart();
    return true;
  }, [ready, openCart]);

  const setQuantity = useCallback((productId: string, quantity: number) => {
    if (quantity !== 1) return;
    updateItems((current) => current.map((item) => item.productId === productId
      ? { ...item, quantity: 1 }
      : item));
  }, [updateItems]);

  const removeItem = useCallback((productId: string) => {
    updateItems((current) => current.filter((item) => item.productId !== productId));
  }, [updateItems]);

  const clearCart = useCallback(() => {
    clearGuestCart();
    updateItems(() => []);
  }, [updateItems]);

  const value = useMemo<CartContextValue>(() => ({
    openCart,
    items,
    count: items.reduce((total, item) => total + item.quantity, 0),
    ready,
    addItem,
    setQuantity,
    removeItem,
    clearCart,
  }), [items, ready, addItem, setQuantity, removeItem, clearCart, openCart]);

  return <CartContext.Provider value={value}>{children}<CartDrawer open={openedAt !== null && openedAt === pathname} onClose={() => setOpenedAt(null)} /></CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const value = useContext(CartContext);
  if (!value) throw new Error("useCart must be used inside CartProvider.");
  return value;
}
