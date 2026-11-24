# MoneyTreeVentures

MoneyTreeVentures is a Hinglish digital marketplace for downloadable PDF guides, starter kits and bundles, plus a separately fulfilled 1:1 Call Guidance product.

## Stack

- Next.js 16 App Router with Cache Components, React 19, TypeScript and Tailwind CSS v4.
- MongoDB with Mongoose and Better Auth with Google sign-in.
- Cashfree Hosted Checkout, private Cloudflare R2 PDF storage, and Resend transactional email.

## Local development

Install dependencies and start the development server:

```sh
npm install
npm run dev
```

Open `http://localhost:3000`. Public pages can run without provider configuration. Server workflows validate their configuration when used. Copy `.env.example` to the ignored `.env.local` file only when setting up local integrations. Use sandbox/test credentials and a separate test database and private bucket. Never put secrets in source control or `NEXT_PUBLIC_` variables.

See [environment configuration](docs/ENVIRONMENT.md) and [deployment](docs/DEPLOYMENT.md) for integration setup. The [architecture](docs/ARCHITECTURE.md), [database design](docs/DATABASE-DESIGN.md), and [payment flow](docs/PAYMENT-FLOW.md) describe the implementation boundaries.

## Quality checks

```sh
npm test
npm run lint
npx tsc --noEmit
npm run build
npm run test:smoke
npm run test:client-secrets
```

`npm test` compiles and runs the project’s Node test suites. The optional replica-set refund lifecycle test is skipped unless `MONGODB_TEST_URI` points to a dedicated disposable test cluster; never use a production URI. Run it separately with `npm run test:integration` when that test database is available.

`npm run test:smoke` requires a completed production build. It starts a local Next.js production server on a temporary loopback port, checks the homepage, robots file, sitemap, and rejection of unsigned Cashfree webhooks, then stops the server.

## Launch readiness

Production provider setup, environment separation, Atlas transaction/index checks, R2 download verification, staging browser review, and domain/DNS actions remain owner-operated tasks. Review [Phase 5 launch readiness](docs/LAUNCH-READINESS.md) before launch. No deployment or DNS change is performed by local development commands.
