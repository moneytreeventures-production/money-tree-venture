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
  const [confirming, setConfirming] = useState(false);
  const [currentPricePaise, setCurrentPricePaise] = useState(pricePaise);
  useEffect(() => {
    let active = true;
    void fetch("/api/orders/ownership", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items: [{ productId, quantity: 1 }] }), cache: "no-store", credentials: "same-origin" })
      .then((response) => response.ok ? response.json() : response.status === 401 ? null : Promise.reject(new Error("Ownership check unavailable")))
      .then((result: { data?: { ownedProductIds?: string[]; products?: Array<{ pricePaise: number }> } } | null) => { if (active) { setOwned(Boolean(result?.data?.ownedProductIds?.includes(productId.toLowerCase()))); if (result?.data?.products?.[0]) setCurrentPricePaise(result.data.products[0].pricePaise); } })
      .catch(() => { if (active) setOwned(null); });
    return () => { active = false; };
  }, [productId]);
  const alreadyInCart = items.some((item) => item.productId === productId.toLowerCase());

  function addToCart() {
    const result = addItem(productId);
    setAdded(result);
    setNotice(result ? `${productName} was added to your cart.` : "Your cart limit has been reached. Review your cart.");
  }

  return <div className="grid gap-3">
    <button type="button" aria-label={`Add to cart: ${productType === "call_guidance" ? "1:1 Call Guidance" : productName}`} disabled={!ready || alreadyInCart || owned !== false} onClick={addToCart} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-accent px-6 text-sm font-semibold text-[#0f1e36] transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-wait disabled:opacity-60">
      {added ? <Check size={17} aria-hidden="true" /> : <ArrowRight size={17} aria-hidden="true" />}
      {ready ? "Add to cart" : "Loading your cart…"}
    </button>
    {owned && <div className="rounded-xl border border-border p-4 text-sm text-foreground-secondary"><p>{productType === "call_guidance" ? "You already have access to this Call Guidance purchase. Check your account before buying another session." : "You already own this product. You can download it again from My Library without paying."}</p><Link href="/account/library" className="mt-3 inline-block font-semibold text-accent-foreground underline">Go to My Library</Link>{productType !== "call_guidance" && !alreadyInCart && <div className="mt-3"><button type="button" onClick={() => setConfirming(true)} className="font-semibold text-foreground underline">Purchase Again</button>{confirming && <div className="mt-3 rounded-lg bg-surface-secondary p-3"><p>Purchase {productName} again for {formatINR(currentPricePaise)}. The final payable amount is checked at checkout.</p><button type="button" onClick={() => { addToCart(); setConfirming(false); }} className="mt-3 min-h-10 rounded-full bg-accent px-4 font-semibold text-[#0f1e36]">Confirm Purchase Again</button></div>}</div>}</div>}
    {owned === null && ready && <p className="text-center text-xs text-foreground-secondary">Checking your purchase history. Try again if this remains unavailable.</p>}
    {alreadyInCart && <Link href="/cart" className="text-center text-sm font-semibold text-accent-foreground underline">View Cart</Link>}
    <p className="min-h-5 text-center text-xs text-foreground-secondary" role="status" aria-live="polite">{notice}</p>
  </div>;
}
