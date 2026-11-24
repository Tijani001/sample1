# Implementation checklist

Legend: ✅ done · 🟡 partial / sandboxed · ⏳ not started (needs external access or later phase)

## Phase 1 — Design foundation
- ✅ Design tokens (colour scales, accessible action coral, semantic states, radii, shadows, motion)
- ✅ Geist typography, tabular numerals
- ✅ Official brand assets: supplied logo cropped and traced to vector; inverted variant; favicon, PWA icons, maskable and Apple icons, splash; PDF ticket logo; colour tokens sampled from the logo
- ✅ Responsive shell: desktop header, mobile header, bottom navigation, footer, skip link
- ✅ Primitives: buttons, inputs, fields, badges, notices, overlays (bottom sheet ↔ dialog), tabs, skeletons, toasts

## Phase 2 — Discovery and booking interface
- ✅ Homepage: hero search, trust indicators, recent searches, popular routes, destinations, deals, short hops, how it works, operators, FAQ, install app
- ✅ Search widget: one-way/round trip, autocomplete (cities + terminals, recent, popular, keyboard), animated swap, calendar (range, disabled past, keyboard), passengers, vehicle preference, validation; popovers on desktop, sheets on mobile
- ✅ Results: editable summary, fare date strip, filters (price, times, operators, vehicle, terminals, duration, amenities, refundable, direct, availability), sorting (6), data-backed badges, expandable cards, round-trip two-step selection
- ✅ Trip details: schedule, terminals, route map, stops, vehicle, amenities, policies, luggage, boarding, reviews, sticky summary/action
- ✅ Interactive seat map: data-driven layouts (4/6/7/14/18/30/36/44 + custom), driver, aisles, doors, premium, held/taken states with icons, passenger assignment, live refresh, legend
- ✅ Open-seating operators handled without seat selection

## Phase 3 — Booking and checkout
- ✅ Draft booking with transactional holds and countdown; back/forward navigation preserved
- ✅ Passenger details (guest checkout, saved passengers, emergency contact), validation
- ✅ Add-ons (luggage, flexible cancellation, meal pack where offered); none preselected
- ✅ Transparent fare breakdown; promo codes with validation, expiry, limits, eligibility
- 🟡 Payments: Paystack and Flutterwave adapters implemented (need keys to test live); sandbox gateway for card/transfer/USSD incl. delayed transfer and failure
- ✅ Server-side verification, idempotency, webhooks, duplicate/mismatch/late-payment handling
- ✅ Confirmation screen, boarding-pass tickets with QR, PDF, print, share, calendar, directions, support

## Phase 4 — Account and trip management
- ✅ Email/phone + password auth, sessions, password change, device sign-out
- 🟡 Google sign-in: not configured (needs OAuth client); phone OTP needs an SMS provider
- ✅ Guest booking retrieval (reference + contact, rate-limited)
- ✅ My Trips (upcoming/completed/cancelled), countdowns, cancellation with exact refund quote, reschedule request, rebook, reviews
- ✅ Saved passengers, favourite routes/operators, notification preferences, privacy requests
- ✅ Explore (filters by city, budget, duration, date; weekend escapes), destination pages, Offers
- ✅ In-app notifications; outbox for email/SMS/push/WhatsApp
- 🟡 Outbound delivery workers (need provider credentials)
- ✅ Journey tracking (operator status, delays, ETA, timeline, schematic map, estimate labelling, emergency info, share link)
- ✅ Help centre, contact/support tickets, lost property, operator contacts, in-checkout help

## Phase 5 — Backend and infrastructure
- ✅ Full relational schema, migrations, RLS, indexes, constraints
- ✅ Booking engine invariants (see ARCHITECTURE.md), rate limiting, audit logs
- ✅ Payment provider abstraction
- ✅ Integration layer (native adapter, CSV import parser); ⏳ operator-specific API adapters
- 🟡 With `SEED_DEMO_DATA=false` reference data (cities, terminals, layouts) must be loaded separately

## Phase 6 — Operator portal
- ✅ Onboarding application with document upload metadata (pending until verified)
- ✅ Dashboard (bookings, sales, departures, occupancy, vehicles, cancellation rate, pending settlement)
- ✅ Departures, manifests (role-masked contacts), check-in, seat blocking/release, journey status & delays (notifies passengers), cancel departure (auto full refunds)
- ✅ Ticket verification (camera QR + manual), duplicate boarding prevention
- ✅ Fleet, amenities, availability, custom seat-layout builder
- ✅ Routes & recurring schedules (publish immediately), pause/resume
- ✅ Finance: totals, daily chart, settlements, transactions, CSV export
- 🟡 Document files are recorded as metadata only; wire to private object storage (e.g. Supabase Storage) with malware scanning

## Phase 7 — Admin portal
- ✅ Role-based access (5 roles) with nav and server-side enforcement
- ✅ Overview analytics, top routes, fraud signals
- ✅ Operator verification, suspension, commission
- ✅ Network (terminals), bookings oversight & cancellation, payment reconciliation & webhook log, refunds, settlements, promotions, support desk, users & roles, audit log

## Phase 8 — Quality
- ✅ Type-check (strict), ESLint clean, production build
- ✅ 41 unit/integration tests incl. concurrent seat races, hold expiry, verification, duplicates, late payments, webhooks, promos, tickets, cancellations, operator inventory, RBAC
- ✅ Playwright e2e on desktop and Pixel 7: full guest booking, filters/sort, failed payment, guest retrieval, RBAC
- ✅ Visual review at 390 px and 1280 px for every page; no horizontal overflow
- 🟡 Lighthouse/axe audits in CI not yet automated

## Known limitations
- Demonstration data only; no real operators, fares or partnerships.
- Destination photos are hot-linked from Wikimedia Commons; mirror them to your CDN for production performance.
- Map uses a schematic SVG unless `NEXT_PUBLIC_MAPBOX_TOKEN` is set; turn-by-turn maps and live GPS need operator telematics.
- Travel insurance add-on is intentionally not offered until a licensed insurer is integrated.
- Single display currency (NGN); the schema supports multiple currencies and countries.
