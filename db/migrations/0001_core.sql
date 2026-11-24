-- Goroada core schema. Portable PostgreSQL (runs on Supabase Postgres and on PGlite for local development).
-- Money is stored as integer minor units (kobo for NGN). Timestamps are timestamptz (UTC) and are rendered in
-- the relevant local time zone (cities.tz / terminals).


-- ───────────────────────── Geography ─────────────────────────
create table countries (
  code text primary key,                 -- ISO 3166-1 alpha-2
  name text not null,
  currency text not null,                -- ISO 4217
  default_tz text not null,
  phone_prefix text not null
);

create table regions (
  id text primary key,
  country_code text not null references countries(code),
  name text not null,
  unique (country_code, name)
);

create table cities (
  id text primary key,                   -- slug, e.g. 'lagos'
  name text not null,
  region_id text not null references regions(id),
  country_code text not null references countries(code),
  lat double precision not null,
  lng double precision not null,
  tz text not null,
  popularity int not null default 0,
  blurb text,
  image_url text,
  image_credit text,
  image_source_url text
);
create index cities_name_idx on cities (lower(name));

-- ───────────────────────── Users & access ─────────────────────────
create table users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  phone text unique,
  password_hash text,
  email_verified_at timestamptz,
  status text not null default 'active' check (status in ('active','suspended','deleted')),
  created_at timestamptz not null default now(),
  check (email is not null or phone is not null)
);

create table user_profiles (
  user_id uuid primary key references users(id) on delete cascade,
  full_name text not null,
  preferred_currency text not null default 'NGN',
  home_city_id text references cities(id),
  marketing_opt_in boolean not null default false,
  notification_prefs jsonb not null default '{"email":true,"sms":true,"push":true,"whatsapp":false,"marketing":false}',
  updated_at timestamptz not null default now()
);

create table sessions (
  token_hash text primary key,           -- sha256 of the cookie token; raw tokens are never stored
  user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  user_agent text
);
create index sessions_user_idx on sessions (user_id);

create table admin_roles (
  user_id uuid not null references users(id) on delete cascade,
  role text not null check (role in ('super_admin','operations_manager','finance_manager','support_agent','verification_officer')),
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table saved_passengers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  full_name text not null,
  phone text,
  email text,
  next_of_kin_name text,
  next_of_kin_phone text,
  created_at timestamptz not null default now()
);
create index saved_passengers_user_idx on saved_passengers (user_id);

-- ───────────────────────── Operators ─────────────────────────
create table operators (
  id text primary key,
  name text not null,
  legal_name text,
  status text not null default 'pending' check (status in ('pending','verified','suspended','rejected')),
  is_demo boolean not null default false,
  description text,
  brand_color text not null default '#174363',
  initials text not null,
  support_phone text,
  support_email text,
  hq_city_id text references cities(id),
  seating_mode text not null default 'assigned' check (seating_mode in ('assigned','open')),
  integration_type text not null default 'native' check (integration_type in ('native','api','manual','import')),
  commission_bps int not null default 800 check (commission_bps between 0 and 5000),
  rating_avg numeric(3,2),
  rating_count int not null default 0,
  rc_number text,
  founded_year int,
  created_at timestamptz not null default now()
);

create table operator_staff (
  user_id uuid not null references users(id) on delete cascade,
  operator_id text not null references operators(id) on delete cascade,
  role text not null check (role in ('owner','manager','agent')),
  primary key (user_id, operator_id)
);

create table operator_documents (
  id uuid primary key default gen_random_uuid(),
  operator_id text not null references operators(id) on delete cascade,
  kind text not null check (kind in ('cac_certificate','operating_licence','insurance','tax_clearance','director_id','other')),
  file_name text not null,
  status text not null default 'submitted' check (status in ('submitted','approved','rejected')),
  notes text,
  uploaded_at timestamptz not null default now(),
  reviewed_by uuid references users(id),
  reviewed_at timestamptz
);

create table operator_payout_accounts (
  operator_id text primary key references operators(id) on delete cascade,
  bank_name text not null,
  account_name text not null,
  account_last4 text not null,
  verified boolean not null default false
);

create table terminals (
  id text primary key,
  city_id text not null references cities(id),
  operator_id text references operators(id),   -- null = shared/public park
  name text not null,
  address text not null,
  lat double precision,
  lng double precision,
  phone text,
  boarding_notes text
);
create index terminals_city_idx on terminals (city_id);

-- ───────────────────────── Fleet ─────────────────────────
create table vehicle_layouts (
  id text primary key,
  operator_id text references operators(id),   -- null = Goroada template
  name text not null,
  -- spec: { rows: string[], doors?: [...] } using the layout grammar in src/lib/domain/seat-layout.ts
  spec jsonb not null,
  seat_count int not null check (seat_count > 0),
  premium_surcharge int not null default 0 check (premium_surcharge >= 0)
);

create table seats (
  layout_id text not null references vehicle_layouts(id) on delete cascade,
  seat_no text not null,
  row_idx int not null,
  col_idx int not null,
  is_premium boolean not null default false,
  primary key (layout_id, seat_no)
);

create table vehicle_types (
  id text primary key,
  name text not null,
  category text not null check (category in ('car','suv','minivan','bus','coach')),
  default_layout_id text references vehicle_layouts(id)
);

create table vehicles (
  id text primary key,
  operator_id text not null references operators(id),
  vehicle_type_id text not null references vehicle_types(id),
  layout_id text not null references vehicle_layouts(id),
  plate_number text not null,
  model text not null,
  year int,
  amenities text[] not null default '{}',
  photos text[] not null default '{}',
  status text not null default 'active' check (status in ('active','maintenance','retired')),
  unique (operator_id, plate_number)
);

-- ───────────────────────── Network ─────────────────────────
create table cancellation_policies (
  id text primary key,
  name text not null,
  summary text not null,
  rules jsonb not null,                  -- [{ "hours_before": 24, "refund_pct": 90 }, ...] most generous first
  refundable boolean not null default true,
  allows_reschedule boolean not null default true,
  reschedule_fee int not null default 0
);

create table routes (
  id text primary key,
  operator_id text not null references operators(id),
  origin_city_id text not null references cities(id),
  destination_city_id text not null references cities(id),
  origin_terminal_id text not null references terminals(id),
  destination_terminal_id text not null references terminals(id),
  distance_km int not null,
  duration_min int not null check (duration_min > 0),
  status text not null default 'active' check (status in ('active','paused')),
  check (origin_city_id <> destination_city_id)
);
create index routes_od_idx on routes (origin_city_id, destination_city_id);

create table route_stops (
  route_id text not null references routes(id) on delete cascade,
  seq int not null,
  city_id text references cities(id),
  name text not null,
  offset_min int not null,
  dwell_min int not null default 0,
  kind text not null default 'rest' check (kind in ('rest','pickup','dropoff')),
  primary key (route_id, seq)
);

create table schedules (
  id text primary key,
  route_id text not null references routes(id),
  operator_id text not null references operators(id),
  vehicle_id text not null references vehicles(id),
  departure_time time not null,          -- local time at origin
  days_of_week int[] not null default '{0,1,2,3,4,5,6}', -- 0 = Sunday
  base_fare int not null check (base_fare > 0),
  currency text not null default 'NGN',
  cancellation_policy_id text not null references cancellation_policies(id),
  valid_from date not null default current_date,
  valid_to date,
  demo_load_pct int not null default 0 check (demo_load_pct between 0 and 100),
  status text not null default 'active' check (status in ('active','paused'))
);

create table trips (
  id uuid primary key default gen_random_uuid(),
  schedule_id text references schedules(id),
  route_id text not null references routes(id),
  operator_id text not null references operators(id),
  vehicle_id text not null references vehicles(id),
  layout_id text not null references vehicle_layouts(id),
  service_date date not null,
  departure_at timestamptz not null,
  arrival_est_at timestamptz not null,
  base_fare int not null,
  currency text not null default 'NGN',
  capacity int not null,
  seating_mode text not null default 'assigned',
  status text not null default 'scheduled'
    check (status in ('scheduled','boarding','departed','in_transit','delayed','arrived','cancelled')),
  delay_min int not null default 0,
  updated_at timestamptz not null default now(),
  unique (schedule_id, service_date)
);
create index trips_search_idx on trips (route_id, departure_at);
create index trips_operator_idx on trips (operator_id, departure_at);

-- Seat inventory. One row per non-available seat on a trip. The primary key makes it physically impossible
-- to allocate the same seat twice: holds, sales and blocks all compete for the same (trip_id, seat_no) row.
create table seat_inventory (
  trip_id uuid not null references trips(id) on delete cascade,
  seat_no text not null,
  status text not null check (status in ('held','sold','blocked','external')),
  booking_id uuid,
  held_until timestamptz,
  source text not null default 'goroada' check (source in ('goroada','operator','external_channel')),
  created_at timestamptz not null default now(),
  primary key (trip_id, seat_no),
  check (status <> 'held' or held_until is not null)
);
create index seat_inventory_booking_idx on seat_inventory (booking_id);

-- ───────────────────────── Promotions ─────────────────────────
create table promotions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  description text not null,
  kind text not null check (kind in ('percent','fixed')),
  value int not null check (value > 0),          -- percent (1-100) or minor units
  max_discount int,
  min_subtotal int not null default 0,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  usage_limit int,
  per_user_limit int not null default 1,
  first_booking_only boolean not null default false,
  origin_city_id text references cities(id),
  destination_city_id text references cities(id),
  operator_id text references operators(id),
  category text not null default 'seasonal' check (category in ('first_booking','seasonal','operator','route','referral')),
  terms text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ───────────────────────── Bookings ─────────────────────────
create table bookings (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  user_id uuid references users(id),
  status text not null default 'awaiting_payment' check (status in (
    'awaiting_payment','payment_processing','confirmed','cancelled','refund_pending','refunded','expired','needs_reconciliation')),
  trip_type text not null check (trip_type in ('one_way','round_trip')),
  passenger_count int not null check (passenger_count between 1 and 10),
  contact_name text,
  contact_email text,
  contact_phone text,
  currency text not null default 'NGN',
  fare_total int not null default 0,
  seat_charges int not null default 0,
  addons_total int not null default 0,
  service_fee int not null default 0,
  discount int not null default 0,
  total int not null default 0 check (total >= 0),
  promotion_id uuid references promotions(id),
  hold_expires_at timestamptz,
  access_token_hash text not null,        -- grants the browser that created it (guest checkout) access
  idempotency_key text unique,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text
);
create index bookings_user_idx on bookings (user_id, created_at desc);
create index bookings_contact_idx on bookings (lower(contact_email));
create index bookings_status_hold_idx on bookings (status, hold_expires_at);

create table booking_segments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  trip_id uuid not null references trips(id),
  direction text not null check (direction in ('outbound','return')),
  fare_per_seat int not null,
  unique (booking_id, direction)
);
create index booking_segments_trip_idx on booking_segments (trip_id);

create table booking_passengers (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  seq int not null,
  full_name text not null default '',
  phone text,
  email text,
  next_of_kin_name text,
  next_of_kin_phone text,
  unique (booking_id, seq)
);

create table booking_seats (
  segment_id uuid not null references booking_segments(id) on delete cascade,
  passenger_seq int not null,
  seat_no text not null,
  premium_charge int not null default 0,
  primary key (segment_id, passenger_seq),
  unique (segment_id, seat_no)
);

create table booking_addons (
  booking_id uuid not null references bookings(id) on delete cascade,
  code text not null,
  label text not null,
  quantity int not null check (quantity > 0),
  unit_price int not null,
  total int not null,
  primary key (booking_id, code)
);

create table promo_redemptions (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references promotions(id),
  booking_id uuid not null unique references bookings(id),
  user_id uuid references users(id),
  contact_email text,
  amount int not null,
  created_at timestamptz not null default now()
);
create index promo_redemptions_promo_idx on promo_redemptions (promotion_id);

create table tickets (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  segment_id uuid not null references booking_segments(id) on delete cascade,
  passenger_seq int not null,
  ticket_no text not null unique,
  verification_token text not null unique,     -- 128-bit random, encoded in the QR code
  status text not null default 'valid' check (status in ('valid','boarded','void')),
  issued_at timestamptz not null default now(),
  boarded_at timestamptz,
  boarded_by uuid references users(id),
  unique (segment_id, passenger_seq)            -- prevents duplicate ticket generation
);

-- ───────────────────────── Payments ─────────────────────────
create table payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id),
  provider text not null check (provider in ('demo','paystack','flutterwave')),
  reference text not null unique,
  amount int not null,
  currency text not null,
  status text not null default 'initialized' check (status in ('initialized','pending','success','failed','abandoned','reversed')),
  channel text,
  provider_txn_id text,
  failure_reason text,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);
create index payments_booking_idx on payments (booking_id);
-- At most one successful payment per booking: a second success triggers reconciliation instead of double-confirming.
create unique index payments_one_success_idx on payments (booking_id) where status = 'success';

create table payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  dedupe_key text not null unique,        -- provider event id; makes webhook processing idempotent
  reference text,
  event_type text not null,
  signature_valid boolean not null,
  payload jsonb not null,
  processed_at timestamptz,
  received_at timestamptz not null default now()
);

-- Sandbox payment provider's own ledger. Plays the role of the external gateway in development.
create table demo_gateway_transactions (
  reference text primary key,
  amount int not null,
  currency text not null,
  status text not null default 'pending' check (status in ('pending','success','failed','abandoned')),
  channel text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table refunds (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id),
  payment_id uuid references payments(id),
  amount int not null check (amount >= 0),
  status text not null default 'pending' check (status in ('pending','approved','processed','rejected')),
  reason text not null,
  requested_by uuid references users(id),
  processed_by uuid references users(id),
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create unique index refunds_one_open_idx on refunds (booking_id) where status in ('pending','approved');

create table platform_commissions (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id),
  segment_id uuid not null unique references booking_segments(id),
  operator_id text not null references operators(id),
  gross int not null,
  rate_bps int not null,
  amount int not null,
  created_at timestamptz not null default now()
);

create table operator_settlements (
  id uuid primary key default gen_random_uuid(),
  operator_id text not null references operators(id),
  period_start date not null,
  period_end date not null,
  gross int not null,
  commission int not null,
  refunds int not null default 0,
  net int not null,
  status text not null default 'pending' check (status in ('pending','processing','paid','on_hold')),
  paid_at timestamptz,
  unique (operator_id, period_start, period_end)
);

-- ───────────────────────── Experience ─────────────────────────
create table reviews (
  id uuid primary key default gen_random_uuid(),
  operator_id text not null references operators(id),
  booking_id uuid unique references bookings(id),
  user_id uuid references users(id),
  author_name text not null,
  rating int not null check (rating between 1 and 5),
  comment text,
  route_label text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create index reviews_operator_idx on reviews (operator_id, created_at desc);

create table favourite_routes (
  user_id uuid not null references users(id) on delete cascade,
  origin_city_id text not null references cities(id),
  destination_city_id text not null references cities(id),
  created_at timestamptz not null default now(),
  primary key (user_id, origin_city_id, destination_city_id)
);

create table favourite_operators (
  user_id uuid not null references users(id) on delete cascade,
  operator_id text not null references operators(id),
  created_at timestamptz not null default now(),
  primary key (user_id, operator_id)
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  booking_id uuid references bookings(id) on delete cascade,
  category text not null check (category in ('transactional','marketing')),
  kind text not null,
  title text not null,
  body text not null,
  href text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on notifications (user_id, created_at desc);
create index notifications_booking_idx on notifications (booking_id);

-- Outbound channel queue (email / SMS / push / WhatsApp). Delivered by a worker once a provider is configured.
create table notification_outbox (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('email','sms','push','whatsapp')),
  recipient text not null,
  template text not null,
  payload jsonb not null,
  category text not null check (category in ('transactional','marketing')),
  status text not null default 'queued' check (status in ('queued','sent','failed','skipped_no_provider')),
  created_at timestamptz not null default now()
);

create table journey_events (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  kind text not null check (kind in ('status','delay','eta','location','note')),
  status text,
  message text not null,
  eta timestamptz,
  lat double precision,
  lng double precision,
  source text not null check (source in ('operator','gps','system')),
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);
create index journey_events_trip_idx on journey_events (trip_id, created_at desc);

create table tracking_shares (
  token text primary key,
  booking_id uuid not null references bookings(id) on delete cascade,
  segment_id uuid not null references booking_segments(id) on delete cascade,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table support_tickets (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  user_id uuid references users(id),
  booking_id uuid references bookings(id),
  contact_email text not null,
  category text not null check (category in ('booking','payment','cancellation','lost_property','operator','technical','other')),
  subject text not null,
  status text not null default 'open' check (status in ('open','pending','resolved','closed')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references support_tickets(id) on delete cascade,
  author_kind text not null check (author_kind in ('customer','agent','system')),
  author_user_id uuid references users(id),
  body text not null,
  created_at timestamptz not null default now()
);

create table audit_logs (
  id bigserial primary key,
  actor_user_id uuid references users(id),
  actor_label text not null,
  action text not null,
  entity_type text not null,
  entity_id text,
  data jsonb not null default '{}',
  ip text,
  created_at timestamptz not null default now()
);
create index audit_logs_entity_idx on audit_logs (entity_type, entity_id);
create index audit_logs_created_idx on audit_logs (created_at desc);

-- Trips are materialised from schedules on demand, one service date at a time.
create table trip_materializations (
  service_date date primary key,
  created_at timestamptz not null default now()
);

create table rate_limits (
  key text primary key,
  window_start timestamptz not null,
  count int not null
);

create table data_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  email text not null,
  kind text not null check (kind in ('access','correction','deletion','portability','objection')),
  details text,
  status text not null default 'received' check (status in ('received','in_progress','completed','rejected')),
  created_at timestamptz not null default now()
);
