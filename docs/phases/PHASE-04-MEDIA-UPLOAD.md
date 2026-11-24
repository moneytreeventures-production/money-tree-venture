# Phase 4 — Admin navigation and product media upload

**Checkpoint:** 2026-11-21 · local implementation only

## Implemented

- Kept the admin layout's server-side `AdminGate` as the authorization boundary. `/admin` no longer repeats `requireAdmin()`; uncached dashboard counts render in an async child beneath page-level `Suspense` with a non-sensitive fallback.
- Added separate product-media configuration and an R2 client with media-only credentials, private upload staging, and a distinct public delivery bucket. Existing private PDF storage and fulfilment remain unchanged.
- Added admin-only media upload-intent, completion, listing, and selection routes. The browser uploads directly to a short-lived staging URL. The server checks actual size, MIME, file signature and image decoding before copying to the public bucket and deleting the staging object.
- Added product-media records/index declarations and admin UI progress, previews, saved-media selection and feedback. Verified thumbnail URLs attach to `imageRefs`; videos attach to `promotionalVideoUrl`. New products must first be saved as drafts.
- Existing public catalogue/detail components consume those fields. Detail video remains primary media with controls, poster, `preload="none"`, `playsInline`, and no autoplay; listing cards use thumbnails.

## Safety and configuration

- `R2_BUCKET_NAME` remains private for PDFs. Media config rejects either media bucket matching it or the two media buckets matching each other.
- Production configuration requires a public HTTPS media domain and disallows `.r2.dev`. Signed upload URLs target only the private staging bucket. Cloudflare CORS must be narrowly scoped to approved origins, `PUT`, and `Content-Type`.
- No Cloudflare resources, keys, CORS, domain, DNS, database indexes, or deployment were configured. Public product media is catalogue content; the public bucket must never contain PDFs or customer files.

## Verification

- `npx tsc --noEmit`: passed after current fixes.
- `npm run lint`: passed.
- `npm run test:catalog`: 68 passed, including media service and admin-route authorization tests.
- `npm run test:models`: 14 passed, including media model/index declarations.
- `npm run test:env`: 16 passed, including separation of private PDF R2 configuration from opt-in public media configuration.
- Chromium component checks for product media presentation and malformed admin product records: passed. They use local fixtures and do not authenticate to `/admin` or contact R2.
- `npm run test:providers`: 36 passed, including staging/public bucket separation, image verification, exact-size checks, and upload descriptor rejection. All provider interactions were mocked.
- `npx tsc --noEmit`, `npm run lint`, and `npm run build`: passed. Build emitted two sanitized `admin.api.request_failed` events during prerender for admin counts; the cause is unknown. This does not verify that the Next.js dev navigation warning is gone.
- `npm ls sharp --depth=0`: resolved `sharp@0.35.5` as a direct dependency. No clean dependency installation was run.
- No authenticated owner browser session, disposable MongoDB, or Cloudflare test configuration was used.

## Remaining

- Verify a clean dependency installation in the project's normal CI/developer environment.
- Verify admin navigation warning with an authenticated local session when available.
- Configure and test separate media-only R2 buckets, scoped credentials, CORS and HTTPS delivery domain in a non-production account after owner approval.
- The `sharp` dependency was added directly because image decoding is required. Current `npm ls` and build resolve it; clean-install verification remains pending.
