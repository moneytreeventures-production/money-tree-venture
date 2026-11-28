"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { useCart } from "@/components/cart/cart-provider";
import { checkoutOrderRequest, checkoutSignature, clearCheckoutIdempotencyKey, getCheckoutIdempotencyKey } from "@/lib/checkout/client-idempotency";
import { checkoutOrderErrorMessage } from "@/lib/checkout/order-error";
import { formatINR } from "@/lib/format/currency";
import { SkeletonCheckoutSummary } from "@/components/ui/skeleton";

interface CreateOrderResponse {
  success: boolean;
  data?: { id?: string; orderReference?: string };
  error?: { code?: string; message?: string; details?: Array<{ field?: string }> };
}
interface OwnershipPreview {
  signature: string;
  products: Array<{ productId: string; name: string; pricePaise: number; productType: string }>;
  ownedProductIds: string[];
  payablePaise: number;
}

export default function CheckoutStart() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, isPending, error: sessionError, refetch } = authClient.useSession();
  const customerAuthId = session?.user.id;
  const { items, ready, clearCart } = useCart();
  const itemCount = items.reduce((count, item) => count + item.quantity, 0);
  const [couponCode, setCouponCode] = useState(() => searchParams.get("coupon") ?? "");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [message, setMessage] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [preview, setPreview] = useState<OwnershipPreview | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [confirmedIds, setConfirmedIds] = useState<string[]>([]);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const cartSignature = useMemo(() => checkoutSignature(items, couponCode), [items, couponCode]);
  const currentPreview = preview?.signature === cartSignature ? preview : null;
  const ownedProducts = currentPreview?.products.filter((product) => currentPreview.ownedProductIds.includes(product.productId)) ?? [];
  const needsConfirmation = ownedProducts.some((product) => product.productType !== "call_guidance");
  const guidanceOwned = ownedProducts.some((product) => product.productType === "call_guidance");
  const confirmed = !needsConfirmation || (confirmedIds.length === ownedProducts.length && ownedProducts.every((product) => confirmedIds.includes(product.productId)));
  const signature = useMemo(() => checkoutSignature(items, couponCode, confirmedIds), [items, couponCode, confirmedIds]);

  useEffect(() => {
    if (!ready || !customerAuthId || !items.length) return;
    const controller = new AbortController();
    // Cart or coupon changes require a fresh price and a fresh affirmative choice.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConfirmedIds([]);
    setTermsAccepted(false);
    setPreview(null);
    setPreviewError("");
    void (async () => {
      try {
        const response = await fetch("/api/orders/ownership", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items }), credentials: "same-origin", cache: "no-store", signal: controller.signal });
        const payload = await response.json() as { success: boolean; data?: Omit<OwnershipPreview, "signature" | "payablePaise"> };
        if (!response.ok || !payload.success || !payload.data) throw new Error("Could not verify your cart and current prices. Try again.");
        const subtotal = payload.data.products.reduce((sum, product) => sum + product.pricePaise, 0);
        if (!Number.isSafeInteger(subtotal)) throw new Error("Your cart total could not be verified.");
        let payablePaise = subtotal;
        if (couponCode.trim()) {
          const couponResponse = await fetch("/api/coupons/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: couponCode.trim(), items }), credentials: "same-origin", cache: "no-store", signal: controller.signal });
          const coupon = await couponResponse.json() as { payablePaise?: number };
          if (!couponResponse.ok || !Number.isSafeInteger(coupon.payablePaise) || coupon.payablePaise! < 0 || coupon.payablePaise! > subtotal) throw new Error("The coupon could not be verified. Remove it or try again.");
          payablePaise = coupon.payablePaise!;
        }
        if (!controller.signal.aborted) setPreview({ ...payload.data, signature: cartSignature, payablePaise });
      } catch (error) {
        if (!controller.signal.aborted) setPreviewError(error instanceof Error ? error.message : "Could not verify your cart. Try again.");
      }
    })();
    return () => controller.abort();
  }, [cartSignature, couponCode, customerAuthId, items, ready]);

  async function createOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || busy || !items.length || !session?.user || !currentPreview || !confirmed || guidanceOwned || !termsAccepted) return;
    submitting.current = true;
    setBusy(true);
    setMessage("");
    setErrorCode("");
    const idempotencyKey = getCheckoutIdempotencyKey(signature);
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
        body: JSON.stringify(checkoutOrderRequest(items, couponCode, confirmedIds)),
      });
      const payload = await response.json() as CreateOrderResponse;
      if (!response.ok || !payload.success || !payload.data?.id) {
        if (payload.error?.code === "ORDER_RETRY_MISMATCH") clearCheckoutIdempotencyKey(signature);
        setMessage(checkoutOrderErrorMessage(payload.error));
        setErrorCode(payload.error?.code ?? "");
        return;
      }
      clearCheckoutIdempotencyKey(signature);
      clearCart();
      router.replace("/checkout/" + encodeURIComponent(payload.data.id));
      router.refresh();
    } catch {
      setMessage("Could not create your order. Please try again.");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  if (!ready || isPending) {
    return <SkeletonCheckoutSummary />;
  }

  if (sessionError) {
    return <main className="mx-auto max-w-3xl px-5 py-16 sm:px-8"><h1 className="text-3xl font-semibold text-foreground">Checkout could not be loaded.</h1><p className="mt-3 text-sm text-foreground-secondary">Your session could not be verified. Please try again.</p><button type="button" onClick={() => void refetch()} className="mt-6 rounded-full border border-border px-5 py-3 text-sm font-semibold text-foreground">Try again</button></main>;
  }

  return (
    <main className="mx-auto w-full min-w-0 max-w-3xl px-4 py-10 sm:px-8 sm:py-16">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-foreground">Money Tree Venture · Secure checkout</p>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Prepare your order.</h1>
      <p className="mt-3 text-sm leading-7 text-foreground-secondary">Your final price, availability and any coupon discount will be confirmed here. Cashfree Hosted Checkout opens in the next step.</p>
      <nav aria-label="Checkout navigation" className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold text-accent-foreground">
        <Link href="/cart" className="min-h-11 content-center underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-accent">Back to Cart</Link>
        <Link href="/products" className="min-h-11 content-center underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-accent">Continue Shopping</Link>
      </nav>

      {!items.length ? (
        <div className="mt-8 rounded-2xl border border-border bg-surface p-6">
          <p className="text-base font-semibold text-foreground">There are no resources in your cart.</p>
          <Link href="/products" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-[#0f1e36]">Products <ArrowRight size={15} /></Link>
        </div>
      ) : !session?.user ? (
        <div className="mt-8 rounded-2xl border border-border bg-surface p-6 sm:p-8">
          <h2 className="text-xl font-semibold text-foreground">Google sign in is required for checkout.</h2>
          <p className="mt-3 text-sm leading-7 text-foreground-secondary">Your guest cart stays saved in this browser and will be restored after sign in. No payment happens yet.</p>
          <div className="mt-6 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <Link href="/login?next=%2Fcheckout" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-accent px-6 text-sm font-semibold text-[#0f1e36]">Sign in with Google <ArrowRight size={16} /></Link>
            <Link href="/cart" className="inline-flex min-h-12 items-center justify-center text-sm font-semibold text-foreground-secondary underline underline-offset-4">Review cart</Link>
          </div>
        </div>
      ) : (
        <form onSubmit={createOrder} className="mt-8 rounded-2xl border border-border bg-surface p-6 sm:p-8">
          <p className="break-words text-sm text-foreground-secondary">Signed in as <span className="font-semibold text-foreground">{session.user.name ?? session.user.email}</span></p>
          <p className="mt-2 text-sm text-foreground-secondary">{`Your cart has ${itemCount} ${itemCount === 1 ? "item" : "items"}. The final amount is confirmed in the next step.`}</p>
          <label htmlFor="checkout-coupon" className="mt-6 block text-sm font-medium text-foreground">Coupon code <span className="font-normal text-foreground-secondary">(optional)</span></label>
          <input id="checkout-coupon" value={couponCode} onChange={(event) => { setCouponCode(event.target.value); setMessage(""); }} maxLength={64} autoComplete="off" className="mt-2 min-h-12 w-full rounded-xl border border-border bg-background px-4 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-accent" />
          <p className="mt-2 text-xs leading-5 text-foreground-secondary">Coupon eligibility is checked against your cart.</p>
          {previewError && <p role="alert" className="mt-4 text-sm text-rose-700 dark:text-rose-300">{previewError} <Link href="/cart" className="underline">Review cart</Link></p>}
          {currentPreview && <div className="mt-5 rounded-xl border border-border p-4 text-sm text-foreground-secondary">
            <h2 className="font-semibold text-foreground">Order summary</h2>
            <ul className="mt-3 divide-y divide-border">{currentPreview.products.map((product) => <li key={product.productId} className="flex flex-wrap justify-between gap-2 py-3"><span className="min-w-0 break-words">{product.name} · {product.productType === "call_guidance" ? "1:1 Call Guidance" : product.productType === "pdf_bundle" ? "PDF bundle" : "PDF guide"}</span><span className="font-medium text-foreground">{formatINR(product.pricePaise)}</span></li>)}</ul>
            <p className="flex justify-between gap-3 border-t border-border pt-3"><span>Subtotal</span><span>{formatINR(currentPreview.products.reduce((sum, product) => sum + product.pricePaise, 0))}</span></p>
            {couponCode.trim() && <p className="mt-2 flex justify-between gap-3"><span>Coupon discount</span><span>−{formatINR(currentPreview.products.reduce((sum, product) => sum + product.pricePaise, 0) - currentPreview.payablePaise)}</span></p>}
            <p className="mt-3 flex justify-between gap-3 border-t border-border pt-3 font-semibold text-foreground"><span>Current payable amount</span><span>{formatINR(currentPreview.payablePaise)}</span></p>
            <p className="mt-1 text-xs">This amount is rechecked when your order is created.</p>
            {ownedProducts.length > 0 && <div className="mt-4"><p className="font-semibold text-foreground">{guidanceOwned ? "A Call Guidance purchase in your cart is already active. Remove it before checkout. " : ""}You already own {ownedProducts.length === 1 ? "this product" : "these products"}. Your existing PDF purchases can be downloaded again from My Library without paying.</p>
              <ul className="mt-2 list-inside list-disc">{ownedProducts.map((product) => <li key={product.productId}>{product.name} — {formatINR(product.pricePaise)}</li>)}</ul>
              <Link href="/account/library" className="mt-3 inline-block font-semibold text-accent-foreground underline">Go to My Library</Link>
              {guidanceOwned ? <p className="mt-2">Remove the existing Call Guidance item from your cart before checkout.</p> : !confirmed && <button type="button" onClick={() => setConfirmedIds(ownedProducts.map((product) => product.productId))} className="mt-3 block min-h-10 rounded-full border border-border px-4 font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-accent">Purchase Again for {formatINR(currentPreview.payablePaise)}</button>}
              {confirmed && <p className="mt-2 font-semibold text-foreground">You confirmed a new paid purchase for the listed products.</p>}
            </div>}
          </div>}
          <label className="mt-5 flex cursor-pointer items-start gap-3 text-sm leading-6 text-foreground-secondary"><input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} className="mt-1 size-5 shrink-0 accent-orange-600 focus-visible:outline-2 focus-visible:outline-accent" /><span>I have reviewed the <Link href="/terms" className="font-semibold text-foreground underline underline-offset-2">Terms</Link> and <Link href="/refund-policy" className="font-semibold text-foreground underline underline-offset-2">Refund Policy</Link> for this purchase.</span></label>
          <button type="submit" disabled={busy || !items.length || !currentPreview || !confirmed || guidanceOwned || !termsAccepted} className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-accent px-6 text-sm font-semibold text-[#0f1e36] transition-colors hover:bg-accent-hover disabled:cursor-wait disabled:opacity-60">
            {busy && <LoaderCircle size={17} className="animate-spin" aria-hidden="true" />}
            {busy ? "Preparing your order…" : "Review order"}
          </button>
          <div className="mt-4 min-h-6 text-sm text-rose-700 dark:text-rose-300" role={message ? "alert" : undefined} aria-live="polite">
            <p>{message}</p>
            {message && <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
              {["ALREADY_PURCHASED", "REPURCHASE_CONFIRMATION_REQUIRED"].includes(errorCode) && <Link href="/account/library" className="font-semibold underline underline-offset-4">My Library</Link>}
              {errorCode === "ACTIVE_CHECKOUT" && <Link href="/account/orders?tab=processing" className="font-semibold underline underline-offset-4">Check orders</Link>}
              {["ALREADY_PURCHASED", "REPURCHASE_CONFIRMATION_REQUIRED", "REPURCHASE_CONFIRMATION_STALE", "CART_DUPLICATE_ITEM", "CART_QUANTITY_INVALID", "CART_INVALID_ITEMS", "NOT_FOUND", "VALIDATION_ERROR"].includes(errorCode) && <Link href="/cart" className="font-semibold underline underline-offset-4">Review and refresh cart</Link>}
            </div>}
          </div>
        </form>
      )}
    </main>
  );
}
