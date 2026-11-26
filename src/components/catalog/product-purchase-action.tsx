"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { useCart } from "@/components/cart/cart-provider";
import { formatINR } from "@/lib/format/currency";

export function ProductPurchaseAction({ productId, productName, productType, pricePaise }: { productId: string; productName: string; productType: "pdf" | "pdf_bundle" | "call_guidance"; pricePaise: number }) {
  const { addItem, ready, items } = useCart();
  const [notice, setNotice] = useState("");
  const [added, setAdded] = useState(false);
  const [owned, setOwned] = useState<boolean | null>(null);
  const [ownershipError, setOwnershipError] = useState(false);
  const [ownershipRetry, setOwnershipRetry] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [currentPricePaise, setCurrentPricePaise] = useState(pricePaise);
  useEffect(() => {
    let active = true;
    void fetch("/api/orders/ownership", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items: [{ productId, quantity: 1 }] }), cache: "no-store", credentials: "same-origin" })
      .then((response) => response.ok ? response.json() : response.status === 401 ? null : Promise.reject(new Error("Ownership check unavailable")))
      .then((result: { data?: { ownedProductIds?: string[]; products?: Array<{ pricePaise: number }> } } | null) => {
        if (result && (!Array.isArray(result.data?.ownedProductIds) || !Array.isArray(result.data?.products))) throw new Error("Ownership check unavailable");
        if (active) {
          setOwned(Boolean(result?.data?.ownedProductIds?.includes(productId.toLowerCase())));
          setOwnershipError(false);
          if (result?.data?.products?.[0]) setCurrentPricePaise(result.data.products[0].pricePaise);
        }
      })
      .catch(() => { if (active) { setOwned(null); setOwnershipError(true); } });
    return () => { active = false; };
  }, [productId, ownershipRetry]);
  const alreadyInCart = items.some((item) => item.productId === productId.toLowerCase());

  function addToCart() {
    const result = addItem(productId);
    setAdded(result);
    setNotice(result ? `${productName} was added to your cart.` : alreadyInCart ? "This product is already in your cart." : "Your cart limit has been reached. Review your cart.");
  }

  return <div className="grid gap-3">
    <button type="button" aria-label={`Add to cart: ${productType === "call_guidance" ? "1:1 Call Guidance" : productName}`} disabled={!ready || alreadyInCart || owned !== false} onClick={addToCart} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-accent px-6 text-sm font-semibold text-[#0f1e36] transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-wait disabled:opacity-60">
      {added ? <Check size={17} aria-hidden="true" /> : <ArrowRight size={17} aria-hidden="true" />}
      {!ready ? "Loading your cart…" : alreadyInCart ? added ? "Added to cart" : "Already in cart" : owned ? "Already owned" : ownershipError ? "Purchase check unavailable" : owned === null ? "Checking availability…" : "Add to cart"}
    </button>
    {owned && <div className="rounded-xl border border-border bg-surface p-4 text-sm leading-6 text-foreground-secondary"><p>{productType === "call_guidance" ? "You already have access to this Call Guidance purchase. Check your account before buying another session." : "You already own this product. Your existing PDF may still be available in My Library."}</p><Link href="/account/library" className="mt-2 inline-flex min-h-11 items-center font-semibold text-accent-foreground underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-accent">Go to My Library</Link>{productType !== "call_guidance" && !alreadyInCart && <div className="mt-2 border-t border-border pt-3"><button type="button" onClick={() => setConfirming(true)} className="min-h-11 font-semibold text-foreground underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-accent">Purchase Again</button>{confirming && <div className="mt-3 rounded-lg bg-surface-secondary p-3"><p>Purchase {productName} again for {formatINR(currentPricePaise)}. The final payable amount is checked at checkout.</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => { addToCart(); setConfirming(false); }} className="min-h-11 rounded-full bg-accent px-4 font-semibold text-[#0f1e36] focus-visible:outline-2 focus-visible:outline-accent">Confirm Purchase Again</button><button type="button" onClick={() => setConfirming(false)} className="min-h-11 rounded-full border border-border px-4 font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-accent">Cancel</button></div></div>}</div>}</div>}
    {owned === null && ready && !ownershipError && <p className="text-center text-xs text-foreground-secondary" role="status">Checking your purchase history…</p>}
    {ownershipError && ready && <div className="flex flex-wrap items-center justify-center gap-2 text-sm text-foreground-secondary" role="alert"><span>Purchase history is unavailable right now.</span><button type="button" onClick={() => { setOwnershipError(false); setOwnershipRetry((value) => value + 1); }} className="min-h-11 font-semibold text-accent-foreground underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-accent">Retry check</button></div>}
    {alreadyInCart && <Link href="/cart" className="inline-flex min-h-11 items-center justify-center text-sm font-semibold text-accent-foreground underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-accent">View Cart</Link>}
    <p className="min-h-5 text-center text-xs text-foreground-secondary" role="status" aria-live="polite">{notice}</p>
  </div>;
}
