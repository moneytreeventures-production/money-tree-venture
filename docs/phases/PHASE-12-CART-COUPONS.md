# Phase 12 — Cart coupons and secure pricing

## Implementation

The existing coupon model, integer-paise checkout pricing, owner-only `/admin/coupons`, order reservation and Cashfree redemption flow were reused. No second coupon model or order lifecycle was added.

The final correction makes coupon preview server-authoritative. The preview accepts only a coupon code and product IDs with quantities; it rejects browser prices or subtotals. It loads currently published products, uses current database prices, checks minimum cart value and product/category restrictions, and prices discounts through the existing `priceOrder` utility. Checkout now shares the same product/category eligibility helper and continues to repeat all validation from trusted records. Preview does not reserve capacity or redeem coupons. The cart displays subtotal, discount and payable from the returned quote while its cart and product-price signature matches; cart changes trigger a recheck, earlier requests are aborted, and failed or stale previews cannot supply a confirmed discount. Unavailable products continue to block checkout.

Checkout also continues to enforce coupon active/start/end status, total and per-customer usage limits, and zero-total rejection, then independently reserves within the order transaction. The verified-payment callback remains idempotent. These transaction and payment properties have not been verified against a real MongoDB deployment or Cashfree.

Product/category restrictions and per-customer redemption limits exist in the backend and checkout enforces them. The admin form does not expose those fields; this remains an admin usability limitation. Anonymous cart preview cannot evaluate a customer-specific redemption count; checkout evaluates that limit after customer authentication and will reject an ineligible use.

## Verification record

Previous Phase 12 verification recorded: checkout tests 18/18 PASS, catalogue tests 78/78 PASS, TypeScript and ESLint PASS, Chromium component fixtures 4/4 PASS (without coupon-flow coverage), isolated production build and smoke PASS. That isolated build used process-only safe media and dummy localhost database settings and logged two sanitized admin database errors. An ordinary production build remains blocked by the existing `r2.dev` media URL validation. No `.env.local` change was made.

Final correction checks:

- Coupon/cart and checkout tests: 22/22 PASS, including current server prices, cart add/remove quote recalculation, restrictions, minimums, caps, unavailable products, forged subtotal/price rejection, out-of-date response rejection, and existing checkout authorization/price-forgery regressions.
- Focused Chromium fixtures: 5/5 PASS. The new cart fixture verifies the cart’s current-quote gate and request cancellation wiring; it is a browser-level invariant fixture, not a full interactive authenticated cart journey.
- TypeScript: PASS (`tsc --noEmit --incremental false`).
- Focused ESLint: PASS.
- Isolated production build: PASS with process-only `PUBLIC_MEDIA_BASE_URL=https://media.example.com`, dummy localhost MongoDB URI/name. Two sanitized admin database request errors were logged because no database was available. This is not a database check.
- Existing broad production smoke script: FAIL/NOT_VERIFIED. The first request timed out; rerunning produced the same timeout, so it did not complete its route assertions. A focused production check passed: the built coupon preview endpoint returned HTTP 403 for a cross-origin POST, without accessing MongoDB.
- `git diff --check`: PASS (existing line-ending notices only).
- Real MongoDB transactions/concurrent reservations, real Cashfree payment journeys, and authenticated browser cart/owner journeys: NOT_VERIFIED.

## Phase 13 dependencies

Carry forward a disposable non-production MongoDB replica set test for reservations, expiration, concurrent usage-limit enforcement and idempotent redemption; a Cashfree sandbox payment/callback journey; authenticated owner/customer browser checks; a full interactive cart coupon browser test; and configuration of a production HTTPS media domain. Do not treat mocks or the isolated build as completion of those checks.
