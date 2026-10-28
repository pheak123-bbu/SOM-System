# API and database notes

## API routes currently present

All application data routes require the Auth.js HttpOnly session cookie and scope reads/writes to the active store membership.

| Method and route | Purpose |
| --- | --- |
| `GET, POST /api/auth/[...nextauth]` | Keycloak OpenID Connect sign-in, callback and sign-out endpoints. |
| `POST /api/auth/login` | Disabled (410); password authentication is handled by Keycloak. |
| `GET, POST /api/auth/admin/users` | List store users or provision local store access (owner only); new users must also be created in Keycloak with the matching verified email. |
| `PATCH, DELETE /api/auth/admin/users/:userId` | Update a store user's name, email or role, or remove eligible local app access (owner only). |
| `GET /api/health` | Database liveness/readiness response. |
| `GET, POST /api/customers` | Search/paginate customer directory and create a customer. |
| `POST /api/customers/:customerId/notes` | Add a store-scoped private customer note. |
| `GET, POST /api/products` | Search product catalogue and create products (owner/admin only). |
| `GET, POST /api/orders` | Search/paginate and create validated orders. Creation requires a UUID idempotency key in the body. |
| `PATCH /api/orders/:orderId/status` | Validate and record a legal status transition. |
| `GET /api/reports` | Aggregate sales, order, product, channel and detection data. Accepts `days`, or `from` and `to` ISO calendar dates. |
| `GET /api/conversations` | List recent store conversations with message previews and pending suggestions; accepts `search` to match customer names or message text. |
| `GET /api/conversations/:conversationId` | Load stored thread, customer and pending suggestions. |
| `POST /api/simulator/messages` | Development-only inbound-message simulation; disabled in production. |
| `GET, POST /api/detection-jobs` | List failed jobs and retry a store-scoped failed job. |
| `POST /api/suggestions/:suggestionId/review` | Record seller review; explicit approval creates a draft, never a confirmed order. |

Routes use Zod request validation and JSON errors. Report and order CSV/XLSX/PDF exports are generated in the browser from the currently loaded data; they are not API endpoints. The PDF action opens a print-ready A4 report, which can be saved using the browser's “Save as PDF” option. Order exports cover the current page or explicitly selected rows, not all paginated results. Integration webhooks and report exports by API are not implemented.

## Relational model

Prisma schema is in `prisma/schema.prisma`; migration SQL is in `prisma/migrations`. Main tables include stores, users, memberships, customers, notes, addresses, products, variants, orders, order items, status history, conversations, messages, detection jobs, suggestions, evidence, reviews, channel connection state and audit logs.

Money uses `Decimal(12,2)` for persisted values. The order service converts input into integer cents and calculates totals from current active product/variant prices. A product and its variant must belong to the authenticated store's catalogue. The order item retains a product/variant/name/SKU/price snapshot. New orders are restricted to `DRAFT` and `PENDING_CONFIRMATION`; seller actions are required for confirmation.

Current report sales include `CONFIRMED`, `PROCESSING`, `SHIPPED` and `DELIVERED`, excluding `DRAFT`, `PENDING_CONFIRMATION` and `CANCELLED`. Refunds do not exist in the schema. Report dates are interpreted in the store timezone (default `Asia/Phnom_Penh`).

## Authorization and production safeguards

`getAuthContext()` reads the Auth.js session and rechecks the user's store membership and `authVersion` for each request. `ExternalIdentity` maps the configured Keycloak issuer and immutable subject to a local user. First-time linking requires a verified Keycloak email matching an existing local account with store membership; the link is audited and subsequent sign-ins use the stored issuer/subject mapping. Do not trust a client-provided store ID or Keycloak role claims for store authorization. Manage password policy, MFA, lockout, account disablement and credential recovery in Keycloak. Database and Redis ports are intentionally not published.
