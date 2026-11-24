# MoneyTreeVentures — Error Handling, Logging and Tests

**Status:** Phase 2.4 shared infrastructure is implemented. No authentication, payment, storage, customer, or admin flows are implemented by these utilities.

## Application errors and status mapping

Use `ApplicationError` for expected failures that may safely be shown to a customer. Give it a stable uppercase code, an HTTP status, an operational classification, and a short customer-safe Hinglish message. Preserve the original failure as `cause` for internal diagnostics. Specialized classes are available for validation (400), authentication (401), authorization (403), not found (404), conflict (409), rate limiting (429), database unavailable (503), external service failure (502), and unexpected internal failure (500). Messages and details must not contain credentials, tokens, raw request values, database messages, or private customer data.

`normalizeError()` provides the central mapping:

| Input | Public code/status | Public details |
|---|---|---|
| Operational `ApplicationError` | Its stable code/status and safe message | Bounded safe field details, when supplied |
| Zod, Mongoose validation, or Mongoose cast error | `VALIDATION_ERROR` / 400 | Field paths and generic Hinglish field messages; submitted values are omitted |
| MongoDB duplicate key (`11000`) | `CONFLICT` / 409 | Generic conflict message; index/value details stay internal |
| MongoDB selection/network/topology error | `DATABASE_UNAVAILABLE` / 503 | Generic temporary availability message |
| Non-operational or unknown error | `INTERNAL_ERROR` / 500 | Generic Hinglish message; no stack or implementation detail |

Operational failures are expected conditions such as validation, missing records, conflicts, or temporary service unavailability. Unexpected failures include programming errors and unclassified exceptions. Do not mark an unknown exception operational just to expose its message. The normalized object retains a `diagnostic` reference for server logging; never serialize that property into a response.

## Route Handler response convention

Use `resolveRequestId(request)` at the start of a Route Handler. By default it generates a UUID and ignores client-supplied IDs. Only set `trustIncomingHeader: true` when the ingress proxy is configured to overwrite `x-request-id`; the helper accepts 8–64 characters from a bounded safe alphabet and replaces invalid/oversized values. Pass the same ID explicitly to log calls and response helpers; there is no mutable global request context.

For failures, use `createErrorResponse(error, requestId)`. It returns:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Di gayi jaankari sahi nahi hai.",
    "details": [{ "field": "email", "message": "Yeh field sahi nahi hai." }]
  },
  "requestId": "a-generated-request-id"
}
```

The helper sets the matching `x-request-id` header and HTTP status. For successful JSON responses, `createJsonResponse(body, requestId, init)` preserves the supplied status/headers and adds the validated request-ID header. Route Handlers should catch/normalize failures at the boundary; do not return raw Mongoose, MongoDB, Zod, Cashfree, R2, or Resend errors.

## Structured logging and redaction

Import `logger` from `src/lib/logger`. Calls accept a short event message and safe structured fields:

```ts
logger.info("database.connection.reconnected", { requestId, component: "mongodb" });
logger.error("checkout.persistence.failed", { requestId, error: normalized.diagnostic });
```

Entries are JSON with timestamp, level, message, optional request ID, and sanitized metadata. Levels are `debug`, `info`, `warn`, and `error`; production suppresses debug. The MongoDB connection lifecycle now uses this logger. Never pass full request bodies, PDF contents, payment-card data, session cookies, signed URLs, or raw provider/database payloads.

Redaction masks common secret, credential, token, URL, payment-card, email, phone, and customer-data key names, including nested fields. It also scrubs common MongoDB URI, bearer-token, credential-assignment, email-address, and signed-URL patterns in strings. Mongoose and Zod validation errors are summarized by safe field paths instead of logging rejected values. This is defensive filtering, not a universal secret detector: arbitrary encodings, unknown credential formats, or secrets hidden in unstructured text may not be recognized. Keep log messages and metadata safe before they reach the logger.

## Test conventions

- Unit tests live under `tests/<area>/`, use Node's built-in `node:test` and `node:assert/strict`, and do not call real external services.
- Environment, connection, model, error, logger, request-ID, and response tests run from `tsconfig.env-test.json` in separate Node test processes via `--conditions=react-server` for the `server-only` marker.
- Run suites with `npm run test:env`, `npm run test:db`, `npm run test:models`, and `npm run test:infra`.
- Future MongoDB transaction, provider webhook, R2 object, and email integration tests must be marked/documented separately and use isolated non-production services. Unit tests must keep mocking external boundaries.
- When adding an error, choose a stable code/status and safe Hinglish public message, add normalization tests, and verify response output omits causes and sensitive details. When adding a logger field, use a bounded safe value and add a redaction test if it may contain credentials or PII.

No external account, live database, or production credential is used by the current tests.
