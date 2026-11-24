import type { Db, Queryable } from "./client";
import { CITIES, DEMO_PASSWORD, DEMO_PROMOTIONS, DEMO_REVIEWS, DEMO_USERS, OPERATORS, PAIRS, POLICIES, RATE_PER_KM, REGIONS, SPEED_FACTOR, TERMINALS } from "./seed-data";
import { CITY_IMAGES } from "./city-images";
import { LAYOUT_TEMPLATES, parseLayout } from "@/lib/domain/seat-layout";
import { hashPassword } from "@/lib/auth/password";
import { log } from "@/lib/log";

/** Deterministic hash → [0,1) so seeded data is stable between runs. */
function rand(key: string) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

export async function insertMany(q: Queryable, table: string, cols: string[], rows: unknown[][], suffix = "") {
  const chunk = Math.max(1, Math.floor(30000 / cols.length));
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk);
    const params: unknown[] = [];
    const values = part.map((r) => `(${r.map((v) => { params.push(v); return `$${params.length}`; }).join(",")})`);
    await q.query(`insert into ${table} (${cols.join(",")}) values ${values.join(",")} ${suffix}`, params);
  }
}

const VEHICLE_TYPES: [string, string, "car" | "suv" | "minivan" | "bus" | "coach", string][] = [
  ["car-4", "4-seater car", "car", "car-4"],
  ["suv-6", "6-seater SUV", "suv", "suv-6"],
  ["minivan-7", "7-seater minivan", "minivan", "minivan-7"],
  ["bus-14", "14-seater bus", "bus", "bus-14"],
  ["bus-18", "18-seater bus", "bus", "bus-18"],
  ["bus-30", "30-seater bus", "bus", "bus-30"],
  ["coach-std", "Standard coach", "coach", "coach-std-44"],
  ["coach-exec", "Executive coach", "coach", "coach-exec-36"],
];

function departureTimes(min: number): string[] {
  if (min >= 420) return ["05:30", "06:30", "07:00", "19:30"];
  if (min >= 180) return ["06:00", "07:30", "09:00", "12:00", "14:30"];
  return ["06:00", "07:00", "08:30", "10:00", "12:30", "15:00", "17:30"];
}

export async function seedIfEmpty(db: Db) {
  const [{ n }] = await db.query<{ n: number }>(`select count(*)::int as n from countries`);
  if (n > 0) return;
  const t0 = Date.now();
  await db.tx(async (q) => {
    await q.query(`insert into countries (code,name,currency,default_tz,phone_prefix) values ('NG','Nigeria','NGN','Africa/Lagos','+234')`);
    await insertMany(q, "regions", ["id", "country_code", "name"], REGIONS.map(([id, name]) => [id, "NG", name]));
    await insertMany(q, "cities", ["id", "name", "region_id", "country_code", "lat", "lng", "tz", "popularity", "blurb", "image_url", "image_credit", "image_source_url"],
      CITIES.map((c) => [c.id, c.name, c.region, "NG", c.lat, c.lng, "Africa/Lagos", c.popularity, c.blurb, CITY_IMAGES[c.id]?.url ?? null, CITY_IMAGES[c.id]?.credit ?? null, CITY_IMAGES[c.id]?.source ?? null]));

    // Operators
    await insertMany(q, "operators", ["id", "name", "legal_name", "status", "is_demo", "description", "brand_color", "initials", "support_phone", "support_email", "hq_city_id", "seating_mode", "integration_type", "commission_bps", "rating_avg", "rating_count", "rc_number", "founded_year"],
      OPERATORS.map((o, i) => [o.id, o.name, o.legal, "verified", true, o.description, o.color, o.initials, `+234 700 000 ${String(1000 + i * 111).slice(0, 4)}`, `support@${o.id}.demo`, o.hq, o.seating, o.integration, 800, o.rating, o.ratingCount, `RC-DEMO-${100000 + i * 7919}`, o.founded]));
    await insertMany(q, "operator_payout_accounts", ["operator_id", "bank_name", "account_name", "account_last4", "verified"],
      OPERATORS.map((o, i) => [o.id, "Demo Bank", o.legal, String(4021 + i * 13).slice(-4), true]));
    await insertMany(q, "operator_documents", ["operator_id", "kind", "file_name", "status"],
      OPERATORS.flatMap((o) => [[o.id, "cac_certificate", "cac-certificate.pdf", "approved"], [o.id, "operating_licence", "operating-licence.pdf", "approved"], [o.id, "insurance", "fleet-insurance.pdf", "approved"]]));

    // Terminals (one set per city, shared by operators in this demo)
    const terminalRows: unknown[][] = [];
    for (const c of CITIES) {
      (TERMINALS[c.id] ?? []).forEach(([suffix, name, address], i) => {
        terminalRows.push([`${c.id}-${suffix}`, c.id, name, address, c.lat + (i - 0.5) * 0.02, c.lng + (i - 0.5) * 0.02, "Arrive 45 minutes before departure. Show your Goroada QR ticket at the operator desk."]);
      });
    }
    await insertMany(q, "terminals", ["id", "city_id", "name", "address", "lat", "lng", "boarding_notes"], terminalRows);

    // Layouts, seats, vehicle types
    for (const [id, t] of Object.entries(LAYOUT_TEMPLATES)) {
      const parsed = parseLayout(t.spec);
      await q.query(`insert into vehicle_layouts (id, name, spec, seat_count, premium_surcharge) values ($1,$2,$3,$4,$5)`, [id, t.name, JSON.stringify(t.spec), parsed.seats.length, t.premiumSurcharge]);
      await insertMany(q, "seats", ["layout_id", "seat_no", "row_idx", "col_idx", "is_premium"], parsed.seats.map((s) => [id, s.seatNo, s.row, s.col, s.premium]));
    }
    await insertMany(q, "vehicle_types", ["id", "name", "category", "default_layout_id"], VEHICLE_TYPES);
    await insertMany(q, "cancellation_policies", ["id", "name", "summary", "rules", "refundable", "allows_reschedule", "reschedule_fee"],
      POLICIES.map((p) => [p.id, p.name, p.summary, JSON.stringify(p.rules), p.refundable, p.allows_reschedule, p.reschedule_fee]));

    const vehiclesByOp = new Map<string, { id: string; layout: string }[]>();
    const vehicleRows: unknown[][] = [];
    for (const o of OPERATORS) {
      const list: { id: string; layout: string }[] = [];
      let k = 0;
      const total = o.vehicles.reduce((a, v) => a + v.count, 0);
      for (const v of o.vehicles) {
        for (let i = 0; i < v.count; i++) {
          k++;
          const id = `${o.id}-v${k}`;
          list.push({ id, layout: v.layout });
          const plate = `${o.initials}-${String(100 + Math.floor(rand(id) * 899))}-${"ABCDEFGHJK"[k % 10]}${"KLMNPRSTUV"[(k * 3) % 10]}`;
          vehicleRows.push([id, o.id, v.type, v.layout, plate, v.model, 2019 + (k % 6), v.amenities, k === 2 && total >= 3 ? "maintenance" : "active"]);
        }
      }
      vehiclesByOp.set(o.id, list.filter((_, idx) => idx !== 1 || total < 3));
    }
    await insertMany(q, "vehicles", ["id", "operator_id", "vehicle_type_id", "layout_id", "plate_number", "model", "year", "amenities", "status"], vehicleRows);

    // Routes, stops, schedules
    const routeRows: unknown[][] = [];
    const stopRows: unknown[][] = [];
    const scheduleRows: unknown[][] = [];
    for (const pair of PAIRS) {
      for (const [from, to] of [[pair.a, pair.b], [pair.b, pair.a]] as const) {
        pair.ops.forEach((opId, opIdx) => {
          const op = OPERATORS.find((o) => o.id === opId)!;
          const vehicles = vehiclesByOp.get(opId)!;
          const preferred = vehicles.filter((v) =>
            pair.min >= 360 ? v.layout.startsWith("coach") : pair.min <= 200 ? /car|minivan|suv|bus-14/.test(v.layout) : true);
          const pool = preferred.length ? preferred : vehicles;
          const routeId = `${opId}:${from}-${to}`;
          const fromTerms = TERMINALS[from];
          const toTerms = TERMINALS[to];
          const firstLayout = pool[0].layout;
          const duration = Math.round((pair.min * SPEED_FACTOR[firstLayout]) / 5) * 5;
          routeRows.push([routeId, opId, from, to, `${from}-${fromTerms[opIdx % fromTerms.length][0]}`, `${to}-${toTerms[opIdx % toTerms.length][0]}`, pair.km, duration]);
          const via = from === pair.a ? pair.via ?? [] : [...(pair.via ?? [])].reverse().map(([n, c, f, k]) => [n, c, 1 - f, k] as const);
          via.forEach(([name, cityId, frac, kind], i) => stopRows.push([routeId, i + 1, cityId, name, Math.round(duration * frac), kind === "rest" ? 20 : 10, kind]));

          const times = departureTimes(pair.min);
          const count = 1 + Math.floor(rand(routeId) * Math.min(3, times.length));
          const start = Math.floor(rand(`${routeId}:t`) * times.length);
          const picked = [...new Set(Array.from({ length: count }, (_, i) => times[(start + i * 2) % times.length]))];
          for (let i = 0; i < picked.length; i++) {
            const time = picked[i];
            const vehicle = pool[i % pool.length];
            const jitter = 0.95 + rand(`${routeId}:${i}:fare`) * 0.13;
            const fare = Math.max(300000, Math.round((pair.km * RATE_PER_KM[vehicle.layout] * jitter) / 50000) * 50000);
            const dows = rand(`${routeId}:${i}:dow`) < 0.2 ? "{1,2,3,4,5,6}" : "{0,1,2,3,4,5,6}";
            const r = rand(`${routeId}:${i}:load`);
            const load = r > 0.93 ? 100 : r > 0.85 ? 92 : Math.round(15 + r * 65);
            scheduleRows.push([`${routeId}@${time}`, routeId, opId, vehicle.id, time, dows, fare, op.policy, load]);
          }
        });
      }
    }
    await insertMany(q, "routes", ["id", "operator_id", "origin_city_id", "destination_city_id", "origin_terminal_id", "destination_terminal_id", "distance_km", "duration_min"], routeRows);
    await insertMany(q, "route_stops", ["route_id", "seq", "city_id", "name", "offset_min", "dwell_min", "kind"], stopRows);
    await insertMany(q, "schedules", ["id", "route_id", "operator_id", "vehicle_id", "departure_time", "days_of_week", "base_fare", "cancellation_policy_id", "demo_load_pct"], scheduleRows);
    await q.query(`update schedules set valid_from = current_date - 60`);

    // Demo reviews (clearly flagged is_demo)
    const reviewRows: unknown[][] = [];
    OPERATORS.forEach((o, oi) => {
      const pairs = PAIRS.filter((p) => p.ops.includes(o.id));
      for (let i = 0; i < 6; i++) {
        const [rating, comment, author] = DEMO_REVIEWS[(oi * 3 + i) % DEMO_REVIEWS.length];
        const p = pairs[i % pairs.length];
        const ca = CITIES.find((c) => c.id === p.a)!.name;
        const cb = CITIES.find((c) => c.id === p.b)!.name;
        reviewRows.push([o.id, author, rating, comment, i % 2 ? `${cb} → ${ca}` : `${ca} → ${cb}`, true, new Date(Date.now() - (i * 9 + oi + 2) * 86400_000).toISOString()]);
      }
    });
    await insertMany(q, "reviews", ["operator_id", "author_name", "rating", "comment", "route_label", "is_demo", "created_at"], reviewRows);

    // Promotions
    for (const p of DEMO_PROMOTIONS) {
      await q.query(
        `insert into promotions (code,title,description,kind,value,max_discount,min_subtotal,starts_at,ends_at,usage_limit,per_user_limit,first_booking_only,origin_city_id,destination_city_id,operator_id,category,terms)
         values ($1,$2,$3,$4,$5,$6,$7, now() + make_interval(days => $8), now() + make_interval(days => $9),$10,$11,$12,$13,$14,$15,$16,$17)`,
        [p.code, p.title, p.description, p.kind, p.value, p.max_discount, p.min_subtotal, p.days[0], p.days[1], p.usage_limit, p.per_user_limit, p.first_booking_only, p.origin, p.destination, p.operator, p.category,
          `Demonstration promotion for testing. Discount applies to fares and seat charges only, not booking fees or add-ons. ${p.min_subtotal ? `Minimum fare spend ₦${(p.min_subtotal / 100).toLocaleString("en-NG")}. ` : ""}${p.first_booking_only ? "Valid on your first Goroada booking only. " : ""}Limit ${p.per_user_limit} use${p.per_user_limit > 1 ? "s" : ""} per customer.`],
      );
    }

    // Demo accounts
    const pw = hashPassword(DEMO_PASSWORD);
    for (const u of DEMO_USERS) {
      const [{ id }] = await q.query<{ id: string }>(`insert into users (email, phone, password_hash, email_verified_at) values ($1,$2,$3,now()) returning id`, [u.email, u.phone, pw]);
      await q.query(`insert into user_profiles (user_id, full_name, home_city_id) values ($1,$2,'lagos')`, [id, u.name]);
      if (u.kind === "operator") await q.query(`insert into operator_staff (user_id, operator_id, role) values ($1,$2,'owner')`, [id, u.operator]);
      if (u.kind === "admin") for (const role of u.roles) await q.query(`insert into admin_roles (user_id, role) values ($1,$2)`, [id, role]);
      if (u.kind === "traveller") {
        await q.query(`insert into saved_passengers (user_id, full_name, phone, email, next_of_kin_name, next_of_kin_phone) values ($1,'Adaeze Okafor','+2348030000001','traveller@demo.goroada.app','Chidi Okafor','+2348030000009'),($1,'Obinna Okafor','+2348030000011',null,'Adaeze Okafor','+2348030000001')`, [id]);
        await q.query(`insert into favourite_routes (user_id, origin_city_id, destination_city_id) values ($1,'lagos','abuja'),($1,'lagos','ibadan')`, [id]);
        await q.query(`insert into favourite_operators (user_id, operator_id) values ($1,'atlantic-coaches')`, [id]);
      }
    }
  });
  log.info("db.seeded", { ms: Date.now() - t0 });

  const { seedSampleBookings } = await import("./seed-bookings");
  await seedSampleBookings(db);
}
