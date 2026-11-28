"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCart } from "./cart-provider";
import { AccessibleOverlay } from "@/components/ui/accessible-overlay";
import { SkeletonCartSummary } from "@/components/ui/skeleton";
import { formatINR } from "@/lib/format/currency";

type Product = { id: string; name: string; pricePaise: number; currency: string; productType: string; imageRefs?: string[] };
function Thumbnail({ product }: { product: Product }) {
  const [failed, setFailed] = useState(false);
  const source = product.imageRefs?.[0];
  const safe = source && ((source.startsWith("/") && !source.startsWith("//") && !source.includes("\\")) || /^https:\/\//.test(source));
  return <div className="relative mb-3 size-16 shrink-0 overflow-hidden rounded-xl border border-border bg-surface-secondary">
    {safe && !failed ? <Image src={source} alt={`${product.name} cover`} fill sizes="64px" unoptimized className="object-cover" onError={() => setFailed(true)} /> : <span aria-label={`${product.name}: image unavailable`} className="grid size-full place-items-center font-semibold text-foreground">{product.name.slice(0, 1).toUpperCase()}</span>}
  </div>;
}
export function CartDrawer({ open, onClose }: { open: boolean; onClose(): void }) {
  const { items, ready, removeItem, count } = useCart();
  const reduced = useReducedMotion();
  const key = items.map(item => item.productId).sort().join(",");
  const [quote, setQuote] = useState<{ key: string; products: Product[] } | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [notice, setNotice] = useState("");
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open || !ready || !key) return;
    const controller = new AbortController();
    // Each opening requires fresh public metadata, never a trusted checkout quote.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQuote(null); setError(false);
    const timeout = setTimeout(() => controller.abort(), 15000);
    void fetch(`/api/products?${new URLSearchParams({ ids: key, page: "1", pageSize: "50" })}`, { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        const payload = await response.json();
        if (!response.ok || !payload.success || !Array.isArray(payload.data?.items)) throw new Error("metadata");
        const products: Product[] = payload.data.items;
        if (products.some(product => !product || typeof product.id !== "string" || typeof product.name !== "string" || !["pdf", "pdf_bundle", "call_guidance"].includes(product.productType) || !Number.isSafeInteger(product.pricePaise) || product.pricePaise < 0 || product.currency !== "INR" || (product.imageRefs !== undefined && (!Array.isArray(product.imageRefs) || product.imageRefs.some(image => typeof image !== "string")))) || new Set(products.map(product => product.id)).size !== products.length) throw new Error("metadata");
        if (!controller.signal.aborted) setQuote({ key, products });
      }).catch(() => { if (!disposed) setError(true); }).finally(() => clearTimeout(timeout));
    let disposed = false;
    return () => { disposed = true; clearTimeout(timeout); controller.abort(); };
  }, [open, ready, key, retry]);
  const products = quote?.key === key ? quote.products : [];
  const resolved = quote?.key === key && items.every(item => products.some(product => product.id === item.productId));
  const subtotal = items.reduce((sum, item) => sum + (products.find(product => product.id === item.productId)?.pricePaise ?? 0), 0);
  return <AccessibleOverlay open={open} onClose={onClose} titleId="cart-drawer-title" variant="drawer">
    <div className="flex items-center justify-between gap-3"><h2 id="cart-drawer-title" className="text-2xl font-semibold">Your cart ({ready ? count : 0})</h2><button ref={closeButton} onClick={onClose} className="mt-button mt-button-outline min-h-11" aria-label="Close cart">Close</button></div>
    <p role="status" className="mt-3 text-sm text-foreground-secondary">{notice}</p>
    {!ready ? <SkeletonCartSummary /> : !items.length ? <div className="py-12"><h3 className="text-xl font-semibold">Your next step starts here.</h3><p className="mt-3 text-foreground-secondary">Your cart is empty. Explore our guides and resources.</p></div> : <>
      {error ? <div role="alert" className="my-6"><p>Product details could not be checked. Please try again.</p><button className="mt-button mt-button-outline mt-3" onClick={() => setRetry(value => value + 1)}>Retry</button></div> : quote?.key !== key ? <SkeletonCartSummary /> : null}
      <ul className="my-5 divide-y divide-border"><AnimatePresence initial={false}>{items.map(item => {
        const product = products.find(value => value.id === item.productId);
        return <motion.li key={item.productId} layout={!reduced} exit={{ opacity: 0, x: reduced ? 0 : 20 }} transition={{ duration: reduced ? 0 : 0.18 }} className="py-5">
          {product && <Thumbnail product={product} />}
          <h3 className="break-words font-semibold">{product?.name ?? (quote?.key === key ? "Unavailable product" : "Checking product…")}</h3>
          {product && <><p className="mt-1 text-sm text-foreground-secondary">{product.productType === "call_guidance" ? "1:1 Call Guidance" : product.productType === "pdf_bundle" ? "PDF bundle" : "PDF guide"} · Quantity 1</p><p className="mt-2 font-semibold">{formatINR(product.pricePaise)}</p></>}
          <button className="mt-2 min-h-11 text-sm underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-accent" aria-label={`Remove ${product?.name ?? "product"}`} onClick={() => { removeItem(item.productId); setNotice(`${product?.name ?? "Product"} removed from your cart.`); closeButton.current?.focus(); }}>Remove</button>
        </motion.li>;
      })}</AnimatePresence></ul>
      {resolved && !error ? <div className="border-t border-border py-5"><div className="flex justify-between gap-3 font-semibold"><span>Estimated subtotal</span><span>{formatINR(subtotal)}</span></div><p className="mt-2 text-sm text-foreground-secondary">Pricing, discounts and eligibility are verified at checkout. Apply coupons in your full cart.</p><Link onClick={onClose} href="/checkout" className="mt-button mt-button-primary mt-5 w-full">Continue to checkout</Link></div> : <p className="text-sm text-foreground-secondary">Resolve unavailable product details before continuing to checkout.</p>}
    </>}
    <div className="grid gap-3 pb-[env(safe-area-inset-bottom)]"><Link onClick={onClose} href="/cart" className="mt-button mt-button-outline">View full cart</Link><Link onClick={onClose} href="/products" className="mt-button mt-button-outline">Continue shopping</Link></div>
  </AccessibleOverlay>;
}
