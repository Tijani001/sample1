# Goroada architecture

## Overview

```
src/
  app/
    (consumer)/        Consumer PWA: home, search, trip, book/[id], trips, track, explore, offers, help, account, legal
    operator/          Operator portal (requireOperator guard)
    admin/             Admin portal (role-based guard per area)
    api/               JSON API used by the web app and future iOS/Android apps
  components/          Design-system primitives (ui/), search widget, seat map, ticket, maps, portal shell
  lib/
    domain/            Pure, framework-free business rules (money, pricing, promo, seat layouts, statuses, time)
    services/          Server-side use cases (search, inventory, bookings, payments, tickets, journey, operator)
    integrations/      Operator inventory adapters (native, CSV import; API adapters plug in here)
    db/                Database client, migrations runner, demo seed
    auth/              Sessions, guest access grants, RBAC
db/migrations/         Plain PostgreSQL migrations (shared by PGlite and Supabase)
tests/unit             Vitest: domain rules + booking engine against real Postgres (PGlite in-memory)
tests/e2e              Playwright: complete consumer journeys on desktop and mobile
```

Key decisions:

* **One SQL dialect everywhere.** Local development uses PGlite (PostgreSQL compiled to WASM), production uses Supabase/Postgres through the `postgres` driver. The same migrations and queries run in both, so the transactional booking logic tested locally is the logic that runs in production.
* **Server is the source of truth for money.** The browser shows a live estimate (same pure `computeQuote`), but every price is recomputed in the database transaction (`recalc`) before payment and confirmation.
* **Classic dynamic rendering** (`cacheComponents: false`): almost every page depends on live inventory or the session.
* **API-first services.** Route handlers under `/api` and server actions call the same `lib/services`, so native mobile apps can use `/api/bookings`, `/api/bookings/:id/*` and `/api/trips/:id/seats` without re-implementing logic.

## Booking engine invariants

Seat inventory is a single table, `seat_inventory`, with primary key `(trip_id, seat_no)`. A row exists only for a seat that is **held**, **sold**, **blocked** (operator) or **external** (sold through another channel). Availability = layout seats − rows (ignoring expired holds).

1. **No double booking.** Holds and sales are `INSERT … ON CONFLICT` against the primary key inside a transaction; a seat can be claimed by only one booking. Tested with concurrent racing drafts.
2. **Holds expire.** A draft holds seats for 12 minutes (`HOLD_MINUTES`). Expired holds are ignored by availability, swept before every new hold, and `expireStaleBookings` marks unpaid bookings `expired`.
3. **Confirmation only after verified payment.** `verifyPayment` asks the provider server-to-server, checks reference, amount and currency, then — in one transaction — marks the payment `success`, converts holds to `sold`, issues tickets and records commission.
4. **Idempotency.** Draft creation accepts an `Idempotency-Key`; tickets are unique per `(segment, passenger)`; commissions unique per segment; promo redemptions unique per booking; a partial unique index allows only one `success` payment per booking; webhook events are deduplicated by provider event id.
5. **Late payments are reconciled, never lost.** If payment lands after the hold lapsed: (a) re-secure the same seats if free, (b) otherwise allocate other free seats and notify the traveller, (c) if the departure is full, mark `needs_reconciliation` and open an approved full refund.
6. **Duplicate payments** for an already-paid booking are marked `reversed` and refunded in full.
7. **Mismatched payments** (amount/currency/reference) never confirm; the booking moves to `needs_reconciliation` and is surfaced in Admin → Payments.

Statuses: booking (`awaiting_payment`, `payment_processing`, `confirmed`, `cancelled`, `refund_pending`, `refunded`, `expired`, `needs_reconciliation`) and trip (`scheduled`, `boarding`, `departed`, `in_transit`, `delayed`, `arrived`, `cancelled`) combine into the traveller-facing journey status (`deriveJourneyStatus`).

Trips are **materialised from schedules** per service date on demand (`ensureTrips`), so schedules can repeat indefinitely without pre-generating rows.

## Payments

`lib/services/payments` defines a `PaymentProvider` interface (`initialize`, `verify`, `verifyWebhook`, `parseWebhook`, `refund`).

* **Paystack** and **Flutterwave** adapters call their real REST APIs and verify webhook signatures (HMAC-SHA512 / `verif-hash`). They activate when their secret keys are set.
* **Sandbox** (`demo`) is a self-contained gateway with its own ledger (`demo_gateway_transactions`) so the exact same verification path is exercised. Its checkout page and every resulting ticket/receipt are labelled as sandbox. A “delayed transfer” settles after 30 seconds to exercise the pending path. Disable with `DISABLE_DEMO_PAYMENTS=true`.
* Card details never touch Goroada servers.

## Tickets

Each ticket has a human ticket number (`TKT-XXXX-XXXX`) and a 128-bit random verification token encoded in the QR code (`GOROADA:1:<token>`). Operators verify by camera (BarcodeDetector) or manual entry; boarding is an atomic `UPDATE … WHERE status = 'valid'`, so a ticket can board only once. Tickets can be downloaded as PDF (pdf-lib), added to calendars (ICS) and viewed offline (service worker caches ticket pages the traveller opened).

## Journey tracking

Tracking shows **operator-reported** status and delays (`journey_events`). If no GPS feed exists the UI says so explicitly; a schedule-based position is drawn only as a dashed, labelled estimate. GPS events (`source = 'gps'`) are supported by the schema for future telematics integrations. Travellers can share a time-limited, revocable tracking link that shows no personal data.

## Security and privacy

* Sessions: random 256-bit tokens in `httpOnly`, `SameSite=Lax`, `Secure` (production) cookies; only SHA-256 hashes are stored.
* Passwords: scrypt with per-user salt.
* Guest access: HMAC-signed cookie listing booking ids this browser created or retrieved; retrieval requires reference + matching email/phone and is rate-limited by IP and by reference.
* Authorisation: every booking API checks ownership/grant; operator actions check the operator owns the trip; admin areas use a role matrix (`lib/auth/rbac.ts`) — super admin, operations manager, finance manager, support agent, verification officer. Operator agents see masked passenger phone numbers.
* Database-backed rate limiting (sign-in, sign-up, drafts, promo attempts, support, retrieval).
* Zod validation on every input; parameterised SQL only.
* Row-level security enabled on all tables (`0002_rls.sql`); the app connects with a privileged role and enforces access in the service layer.
* Audit log for administrative, operator, payment and booking-state actions.
* Security headers (`X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`).
* Data minimisation: only passenger names, contact for the lead booker and an emergency contact for the lead passenger. Data-subject requests (NDPA) are captured in `data_requests`.
* Structured JSON logs without personal or card data.

## Operator integrations

`lib/integrations/types.ts` defines `InventoryAdapter` (sync trips, fetch externally sold seats, hold, confirm, release). The native adapter (portal-managed inventory) and CSV bulk schedule import are implemented. API adapters for operators with their own systems plug in per operator once a real integration exists; until then `adapterFor("api")` refuses rather than pretending. Seats sold through other channels are represented as `external` rows so they can never be double-sold on Goroada.

## Design system

Tokens live in `src/app/globals.css` (`@theme`): navy (#194466) and orange scales sampled from the official logo, with an accessible action orange (#C94C08, 4.65:1 with white) for buttons and selected states and the pin coral (#F96B4F) for the mark, semantic success/warning/danger, radii, shadows and easing. Typography is Plus Jakarta Sans (self-hosted variable font, chosen to match the warmth of the wordmark) on a fixed scale of 12/14/16/18/20/24px, with tabular numerals for prices and times. Motion durations are 150–300 ms with `prefers-reduced-motion` respected globally (`MotionConfig reducedMotion="user"` + CSS).
