"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Minus, Plus, Trash2 } from "lucide-react";
import { useCart } from "@/components/cart/cart-provider";
import { formatINR } from "@/lib/format/currency";
import { canCommitCouponPreview, isCouponQuoteCurrent } from "@/lib/coupons/preview-pricing";
import { SkeletonCartSummary } from "@/components/ui/skeleton";

interface CartProduct {
  id: string;
  name: string;
  shortDescription: string;
  productType: "pdf" | "pdf_bundle" | "call_guidance";
  bundleKind?: "starter_kit" | "bundle";
  pricePaise: number;
  currency: "INR";
  callDurationMinutes?: number;
}
interface CartProductsResponse {
  success: boolean;
  data?: { items: CartProduct[] };
  error?: { message?: string };
}

function kindLabel(product: CartProduct): string {
  if (product.productType === "pdf") return "PDF guide";
  if (product.productType === "call_guidance") return "1:1 Call Guidance";
  return product.bundleKind === "starter_kit" ? "PDF starter kit" : "PDF bundle";
}

export default function CartPage() {
  const { items, ready, setQuantity, removeItem } = useCart();
  const itemCount = items.reduce((count, item) => count + item.quantity, 0);
  const [products, setProducts] = useState<CartProduct[]>([]);
  const [productsForItemIds, setProductsForItemIds] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [couponCode, setCouponCode] = useState("");
  const [coupon, setCoupon] = useState<{ code: string; discountPaise: number; subtotalPaise: number; payablePaise: number; cartKey: string } | null>(null);
  const [appliedCouponCode, setAppliedCouponCode] = useState("");
  const [couponRefresh, setCouponRefresh] = useState(0);
  const [couponMessage, setCouponMessage] = useState("");
  const [couponBusy, setCouponBusy] = useState(false);
  const [ownedProducts, setOwnedProducts] = useState<Array<{ productId: string; name: string; pricePaise: number; productType: string }>>([]);
  const itemIds = useMemo(() => items.map((item) => item.productId).sort().join(","), [items]);
  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const cartKey = JSON.stringify({ items: [...items].sort((a, b) => a.productId.localeCompare(b.productId)), prices: products.map((p) => [p.id, p.pricePaise]).sort(([a], [b]) => String(a).localeCompare(String(b))) });

  useEffect(() => {
    if (!ready || !items.length) return;
    const controller = new AbortController();
    void fetch("/api/orders/ownership", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items }), credentials: "same-origin", cache: "no-store", signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((payload: { data?: { products?: Array<{ productId: string; name: string; pricePaise: number; productType: string }>; ownedProductIds?: string[] } } | null) => {
        if (!controller.signal.aborted) setOwnedProducts(payload?.data?.products?.filter((product) => payload.data?.ownedProductIds?.includes(product.productId)) ?? []);
      }).catch(() => { if (!controller.signal.aborted) setOwnedProducts([]); });
    return () => controller.abort();
  }, [items, ready]);

  useEffect(() => {
    if (!ready || !itemIds) {
      // Clear stale catalogue results when hydration finishes with an empty cart.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProducts([]);
      setProductsForItemIds("");
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const query = new URLSearchParams({ ids: itemIds, page: "1", pageSize: "50" });
    fetch("/api/products?" + query.toString(), { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as CartProductsResponse;
        if (!response.ok || !payload.success || !payload.data) throw new Error(payload.error?.message ?? "Loading your cart…");
        setProducts(payload.data.items);
        setProductsForItemIds(itemIds);
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "Loading your cart…");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [itemIds, ready, reload]);

  useEffect(() => {
    if (!appliedCouponCode) return;
    if (!ready || items.length === 0) {
      // Clear a coupon when an external cart action empties the cart.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAppliedCouponCode(""); setCoupon(null); setCouponBusy(false);
      setCouponMessage("Coupon removed because your cart is empty.");
      return;
    }
    if (loading) return;
    if (error) {
      setCouponBusy(false);
      setCouponMessage("Coupon could not be rechecked because cart products did not load. No discount is applied.");
      setAppliedCouponCode("");
      return;
    }
    if (productsForItemIds !== itemIds) return;
    if (items.some((item) => !productById.has(item.productId))) {
      setCouponBusy(false);
      setCouponMessage("Remove unavailable products before applying a coupon.");
      setAppliedCouponCode("");
      return;
    }
    const controller = new AbortController();
    setCouponBusy(true);
    setCoupon(null);
    fetch("/api/coupons/preview", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: appliedCouponCode, items }), signal: controller.signal,
    }).then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Coupon is no longer valid for your cart.");
      if (canCommitCouponPreview(controller.signal, cartKey, cartKey)) {
        setCoupon({ ...result, cartKey });
        setCouponMessage("Coupon applied. Checkout will verify eligibility again.");
      }
    }).catch((reason: unknown) => {
      if (controller.signal.aborted) return;
      setCoupon(null);
      setCouponMessage(reason instanceof Error ? reason.message : "Coupon could not be rechecked. No discount is applied.");
      setAppliedCouponCode("");
    }).finally(() => { if (!controller.signal.aborted) setCouponBusy(false); });
    return () => controller.abort();
  }, [appliedCouponCode, cartKey, couponRefresh, error, itemIds, items, loading, productById, productsForItemIds, ready]);

  if (!ready || loading) {
    return <SkeletonCartSummary />;
  }

  const subtotal = items.reduce((sum, item) => {
    const product = productById.get(item.productId);
    return product ? sum + BigInt(product.pricePaise) * BigInt(item.quantity) : sum;
    }, BigInt(0));
  const unavailable = items.some((item) => !productById.has(item.productId));
  const representable = subtotal <= BigInt(Number.MAX_SAFE_INTEGER);
  const currentSubtotal = representable ? Number(subtotal) : 0;
  const confirmedCoupon = !unavailable && isCouponQuoteCurrent(coupon, cartKey) ? coupon : null;
  const discountPaise = confirmedCoupon?.discountPaise ?? 0;
  const displaySubtotal = confirmedCoupon ? confirmedCoupon.subtotalPaise : currentSubtotal;
  const payable = confirmedCoupon ? confirmedCoupon.payablePaise : currentSubtotal - discountPaise;
  const displayedCouponMessage = couponBusy && appliedCouponCode ? "Checking coupon against current cart and product prices..." : couponMessage;
  async function applyCoupon(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setCoupon(null); setCouponBusy(true); setCouponMessage("Checking coupon against current product prices..."); setAppliedCouponCode(couponCode.trim()); setCouponRefresh((value) => value + 1);
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-12 sm:px-8 sm:py-16">
      <Link href="/products" className="text-xs font-bold tracking-[0.14em] text-accent-foreground">BACK TO PRODUCTS</Link>
      <div className="mt-6 flex flex-col justify-between gap-4 border-b border-border pb-7 sm:flex-row sm:items-end">
        <div>
          <p className="text-[11px] font-bold tracking-[0.17em] text-foreground-secondary">Prepare your order.</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.055em] text-foreground">Your cart</h1>
          <p className="mt-3 text-sm leading-6 text-foreground-secondary">Price and availability are confirmed at checkout so your order stays current.</p>
        </div>
        <span className="text-sm font-medium text-foreground-secondary">{`${itemCount} ${itemCount === 1 ? "item" : "items"}`}</span>
      </div>

      {error && <div className="mt-6 rounded-2xl border border-border bg-surface p-5 text-sm text-foreground-secondary" role="alert"><p>{error}</p><button type="button" onClick={() => setReload((value) => value + 1)} className="mt-3 font-semibold text-foreground underline underline-offset-4">Try again</button></div>}
      {!error && items.length === 0 && (
        <div className="mt-8 rounded-2xl border border-dashed border-border bg-surface/70 px-6 py-14 text-center">
          <h2 className="text-xl font-semibold text-foreground">Your cart is empty.</h2>
          <p className="mt-2 text-sm text-foreground-secondary">Browse published resources and add what you need.</p>
          <Link href="/products" className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-[#0f1e36]">Products <ArrowRight size={15} /></Link>
        </div>
      )}

      {!error && items.length > 0 && (
        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_300px]">
          <ul className="divide-y divide-border border-y border-border">
            {items.map((item) => {
              const product = productById.get(item.productId);
              return (
                <li key={item.productId} className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    {product ? <>
                      <p className="text-[10px] font-bold tracking-[0.15em] text-accent-foreground">{kindLabel(product)}</p>
                      <h2 className="mt-1 text-base font-semibold text-foreground">{product.name}</h2>
                      <p className="mt-1 line-clamp-2 text-sm leading-6 text-foreground-secondary">{product.shortDescription}</p>
                      {product.productType === "call_guidance" && product.callDurationMinutes && <p className="mt-1 text-xs text-foreground-secondary">{product.callDurationMinutes} · 1:1 Call Guidance</p>}
                      <p className="mt-2 text-sm font-semibold text-foreground">{formatINR(product.pricePaise)} each</p>
                    </> : <>
                      <p className="font-semibold text-foreground">This resource is no longer available.</p>
                      <p className="mt-1 text-xs text-foreground-secondary">Remove unavailable items before checkout.</p>
                    </>}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {product && <div className="inline-flex items-center rounded-full border border-border bg-surface">
                      <button type="button" aria-label={`Decrease quantity for ${product.name}`} disabled={item.quantity <= 1} onClick={() => setQuantity(item.productId, item.quantity - 1)} className="flex size-9 items-center justify-center rounded-full text-foreground hover:bg-surface-secondary disabled:opacity-40"><Minus size={14} /></button>
                      <span className="min-w-7 text-center text-sm font-semibold text-foreground">{item.quantity}</span>
                      <button type="button" aria-label={`Increase quantity for ${product.name}`} disabled onClick={() => setQuantity(item.productId, item.quantity + 1)} className="flex size-9 items-center justify-center rounded-full text-foreground hover:bg-surface-secondary disabled:opacity-40"><Plus size={14} /></button>
                    </div>}
                    <button type="button" aria-label={`Remove ${product?.name ?? "Unavailable"} from cart`} onClick={() => removeItem(item.productId)} className="flex size-10 items-center justify-center rounded-full text-foreground-secondary transition-colors hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/40 dark:hover:text-rose-300"><Trash2 size={16} /></button>
                  </div>
                </li>
              );
            })}
          </ul>

          <aside className="h-fit rounded-2xl border border-border bg-surface p-5 sm:p-6">
            <h2 className="text-lg font-semibold text-foreground">Order summary</h2>
            {ownedProducts.length > 0 && <p role="note" className="mt-4 rounded-xl border border-border bg-surface-secondary/60 p-3 text-sm leading-6 text-foreground-secondary sm:p-4">You already own this product. Existing PDFs can be downloaded again from My Library if the link has not expired. Otherwise, to buy PDFs again, continue to checkout.</p>}
            <div className="mt-5 flex justify-between gap-4 border-t border-border pt-4 text-sm">
              <span className="text-foreground-secondary">Subtotal</span>
              <span className="font-semibold text-foreground">{representable ? formatINR(displaySubtotal) : "Calculated at checkout"}</span>
            </div>
            <form onSubmit={applyCoupon} className="mt-5 border-t border-border pt-4"><label htmlFor="cart-coupon" className="text-sm font-medium">Coupon code</label><div className="mt-2 flex gap-2"><input id="cart-coupon" value={couponCode} onChange={event => setCouponCode(event.target.value)} maxLength={64} className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3" /><button disabled={couponBusy || !representable} className="min-h-11 rounded-full border border-border px-4 font-semibold focus-visible:outline-2 focus-visible:outline-accent">{couponBusy ? "Checking..." : "Apply"}</button></div><p role="status" aria-live="polite" className="mt-2 text-xs">{displayedCouponMessage}</p>{confirmedCoupon && <button type="button" onClick={() => {setAppliedCouponCode("");setCoupon(null);setCouponMessage("Coupon removed.");}} className="inline-flex min-h-11 items-center text-sm underline focus-visible:outline-2 focus-visible:outline-accent">Remove coupon</button>}</form>
            {confirmedCoupon && <div className="mt-4 flex justify-between text-sm"><span>Discount</span><span>-{formatINR(discountPaise)}</span></div>}<div className="mt-4 flex justify-between border-t border-border pt-4 font-semibold"><span>Amount payable</span><span>{representable ? formatINR(payable) : "Calculated at checkout"}</span></div><p className="mt-3 text-xs text-foreground-secondary">The server rechecks availability, current prices and coupon eligibility at checkout.</p>{unavailable || !representable ? (
              <button type="button" disabled className="mt-6 inline-flex min-h-12 w-full cursor-not-allowed items-center justify-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-[#0f1e36] opacity-50">
                Proceed to checkout <ArrowRight size={16} />
              </button>
            ) : (
              <Link href={"/checkout" + (confirmedCoupon ? "?coupon=" + encodeURIComponent(confirmedCoupon.code) : "")} className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-[#0f1e36] transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-accent">
                Proceed to checkout <ArrowRight size={16} />
              </Link>
            )}
          </aside>
        </div>
      )}
    </main>
  );
}

