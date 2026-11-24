# Phase 10 ? Reviews and moderation

Implementation checkpoint 2026-11-21. The new review paths are implemented. Live database and authenticated browser journeys remain unverified.

Reviews use a dedicated Mongoose collection with customer/product references, 1?5 rating, bounded text, optional title, display name, pending/approved/rejected status, immutable verified-purchase flag, moderation fields and timestamps. A unique customer/product index enforces one review, and product/status and moderation indexes support reads. Index application to the approved database remains pending.

Submission requires the trusted customer session, a published product, an active entitlement for that customer/product and an order with both orderStatus and paymentStatus equal to paid. Revoked entitlement or refunded/partially refunded order is ineligible for new reviews. An already approved review is not automatically removed after a later refund; future refund-review policy needs owner review. Submissions enter pending. Client-supplied customer identity and verified flags are ignored. The API requires same-origin requests and validates rating and text length. Input is rendered as React text. Duplicate insert races are enforced by the unique index.

Owner-only moderation uses requireAdmin, records moderator and timestamp, and writes an AuditLog in the same Mongo transaction as status changes. Pending reviews can be approved or rejected. Approved reviews can be removed from public view through rejection. Public queries select approved reviews only and project safe fields. Product averages and counts derive only from approved records. Homepage shows only approved verified reviews for published products in a horizontally scrollable strip. It has no automatic movement, so reduced-motion and keyboard users retain the same content.

The reported MetaMask error names chrome-extension://nkbihfbeogaeaoehlefnkodbefgpgknn/scripts/inpage.js. Existing headless Chromium fixtures run without extensions and passed. The owner's exact browser profile was unavailable, so disappearance of that error in a clean profile is unconfirmed. No wallet code was added.

## Verification

TypeScript and ESLint passed after the latest code changes. Review schema test passed. Existing admin authorization tests (18), catalogue tests (78), and Chromium component fixtures (4) passed. An isolated production build passed with process-only PUBLIC_MEDIA_BASE_URL=https://media.example.com and dummy localhost MongoDB. Production smoke passed for public routes, English navigation, 404 and noindex. These checks do not exercise authenticated review submissions or real MongoDB persistence. Ordinary build remains blocked by the existing r2.dev production media validation. A first build attempt failed because two new component files contained invalid UTF-8; corrected and rerun successfully. git diff --check passed with existing line-ending notices.

The 390/768/1440 authenticated review/form/moderation browser matrix, real purchases, refund state, index creation, transaction behavior and review publication are NOT_RUN. Manual verification needs an approved non-production MongoDB with a completed test purchase, an eligible signed-in customer and owner admin. Submit a review, confirm pending is private, approve it, verify product rating and homepage display, then reject it and confirm disappearance. Repeat at the three viewport widths in light and dark themes.

## Changed files

src/lib/db/models/review.ts and index.ts, src/lib/reviews.ts, review API routes, src/components/catalog/review-form.tsx and product-reviews.tsx, src/components/home/home-reviews.tsx, src/components/admin/admin-reviews.tsx and admin-navigation.tsx, src/app/products/[slug]/page.tsx, src/app/page.tsx, src/app/admin/reviews/page.tsx, tests/reviews.test.ts, tsconfig.env-test.json, this report and the project tracking documents.

Phase 11 awaits owner instruction. Existing Cloudflare R2, media domain, database/index, seed mapping, Cashfree, PDF delivery, legal and broader end-to-end blockers remain.
