# Goroada — Every road. One app.

Goroada is a road-travel marketplace: travellers search, compare and book intercity journeys across many transport operators in one place. It is **not** a transport company; journeys are operated by the operators shown on each ticket.

This repository contains three connected applications built on one Next.js codebase:

| App | Path | Who |
| --- | --- | --- |
| Consumer booking app (PWA) | `/` | Travellers (guest or signed in) |
| Operator portal | `/operator` | Transport-company staff |
| Platform admin portal | `/admin` | Goroada staff, role-based |

> **Development build.** All operators, fares, schedules, reviews and availability are clearly labelled **demonstration data**, and payments use a clearly labelled **sandbox gateway**. Nothing here sells real travel.

## Quick start

```bash
npm install
npm run dev            # http://localhost:3000
```

No database or external service is needed: on first request Goroada starts an embedded PostgreSQL (PGlite) in `.data/pglite`, applies the migrations and seeds demo data (~2 s). Delete `.data/pglite` to reset.

### Demo accounts (password `goroada-demo`)

| Email | Role |
| --- | --- |
| `traveller@demo.goroada.app` | Traveller with upcoming, completed and refunded trips |
| `operator@demo.goroada.app` | Owner of *Savannah Line* (operator portal) |
| `admin@demo.goroada.app` | Super admin |
| `finance@demo.goroada.app` | Finance manager (payments, refunds, settlements) |
| `support@demo.goroada.app` | Customer support agent |

Promo codes to try at checkout: `FIRSTTRIP`, `HARMATTAN8`, `LAGIBA1K` (Lagos → Ibadan), `SAVANNAH5`, and `RAINY2026` (expired, to see the error).

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / server (set `APP_SECRET`) |
| `npm run typecheck` | TypeScript strict type-check |
| `npm run lint` | ESLint (Next.js + React hooks rules) |
| `npm test` | Unit + integration tests (Vitest; booking engine runs against a real in-memory Postgres) |
| `npm run test:e2e` | Playwright end-to-end tests, desktop and mobile. If a dev server is already running, use `E2E_PORT=3000 npm run test:e2e` |
| `npm run check` | typecheck + lint + tests |

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript (strict) · Tailwind CSS 4 with a custom token system · Radix primitives (dialog, popover, slider) · Vaul bottom sheets · Motion · Lucide · React Hook Form + Zod · PostgreSQL (PGlite locally, Supabase/Postgres in production via `postgres`) · `qrcode` + `pdf-lib` for tickets · Vitest · Playwright.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for decisions, the booking engine's invariants, payments, security and the integration layer, and [`docs/CHECKLIST.md`](docs/CHECKLIST.md) for what is implemented and what remains.

## Environment variables

Copy `.env.example` to `.env.local`. Everything is optional for local development.

| Variable | Purpose |
| --- | --- |
| `APP_SECRET` | **Required in production.** Signs guest booking-access cookies. |
| `DATABASE_URL` | Postgres/Supabase connection string. Empty = embedded PGlite. |
| `SEED_DEMO_DATA` | `false` disables demo data seeding (production). |
| `NEXT_PUBLIC_SITE_URL` | Public base URL for payment callbacks and share links. |
| `PAYSTACK_SECRET_KEY` | Enables Paystack (cards, transfer, USSD). |
| `FLUTTERWAVE_SECRET_KEY`, `FLUTTERWAVE_WEBHOOK_HASH` | Enables Flutterwave. |
| `DISABLE_DEMO_PAYMENTS` | `true` removes the sandbox gateway (do this in production). |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Mapbox static maps instead of the built-in schematic map. |
| `EMAIL_/SMS_PROVIDER_API_KEY`, `WHATSAPP_PROVIDER_TOKEN`, `WEB_PUSH_PRIVATE_KEY` | Outbound notification channels. Until set, messages are recorded in `notification_outbox` as `skipped_no_provider`. |
| `NEXT_PUBLIC_BRAND_ASSETS` | `official` to use the supplied logo files from `public/brand`. |

## Database

* Migrations: `db/migrations/*.sql` (plain PostgreSQL). They run automatically on boot and are tracked in `schema_migrations`.
* `0001_core.sql` — full schema (geography, users, operators, fleet, layouts & seats, routes, schedules, trips, seat inventory, bookings, payments, refunds, tickets, promotions, reviews, notifications, journey tracking, support, settlements, commissions, audit logs, rate limits, data-subject requests).
* `0002_rls.sql` — enables row-level security on every table; on Supabase it adds read policies for public reference data and owner-only policies for personal data.
* Money is stored as integer kobo; timestamps are `timestamptz` and shown in the city's time zone (`Africa/Lagos`).

**Supabase:** create a project, set `DATABASE_URL` to the pooled connection string, deploy. Migrations and seed run on first boot. For production, set `SEED_DEMO_DATA=false` so no demonstration operators, fares or accounts are created, and onboard real operators through `/operators/join`.

## Deployment

Vercel (or any Node host):

1. Set `APP_SECRET`, `DATABASE_URL` (Supabase), `NEXT_PUBLIC_SITE_URL`, payment keys and `DISABLE_DEMO_PAYMENTS=true`.
2. `npm run build && npm start` (Vercel does this automatically).
3. Register webhook URLs with Paystack/Flutterwave: `https://<domain>/api/webhooks/paystack`, `/api/webhooks/flutterwave`.
4. Schedule a periodic call to expire stale holds (e.g. Vercel Cron hitting any search page, or run `expireStaleBookings` in a worker). Holds are also swept on every booking attempt.

PGlite stores data on local disk, so it is for development and demos only; serverless production must use `DATABASE_URL`.

## Brand assets

The official logo file was **not present in the repository**. The mark used throughout (`src/components/brand/logo.tsx`, `public/brand/*.svg`, PWA icons in `public/icons`) is a faithful vector reconstruction: a coral (#FF6347) location pin above a navy (#174363) road, with the lowercase “goroada” wordmark. To use the official artwork, replace `public/brand/logo.svg`, `logo-inverted.svg` and `icon.svg`, regenerate `public/icons/*.png` from it, and set `NEXT_PUBLIC_BRAND_ASSETS=official`.

## Photo credits

Destination photographs are loaded from Wikimedia Commons under their free licences; see `/legal/credits`. If a photo cannot load (slow network, offline), a designed fallback is shown.
