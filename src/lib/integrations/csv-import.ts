/**
 * Authorised bulk schedule import. Parses an operator CSV into validated schedule rows.
 * Columns: route_id, departure_time (HH:MM), days (e.g. "Mon-Sat" or "Mon,Wed,Fri" or "Daily"), fare_ngn, vehicle_plate, policy
 */
export type ScheduleImportRow = { routeId: string; time: string; days: number[]; fareMinor: number; vehiclePlate: string; policyId: string };
export type ImportResult = { rows: ScheduleImportRow[]; errors: { line: number; message: string }[] };

const DAY = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function parseDays(v: string): number[] | null {
  const s = v.trim().toLowerCase();
  if (s === "daily") return [0, 1, 2, 3, 4, 5, 6];
  const range = s.match(/^(\w{3})-(\w{3})$/);
  if (range) {
    const a = DAY.indexOf(range[1]), b = DAY.indexOf(range[2]);
    if (a < 0 || b < 0) return null;
    const out: number[] = [];
    for (let i = a; ; i = (i + 1) % 7) { out.push(i); if (i === b) break; }
    return out.sort();
  }
  const list = s.split(/[,\s]+/).map((d) => DAY.indexOf(d.slice(0, 3)));
  return list.some((d) => d < 0) ? null : [...new Set(list)].sort();
}

export function parseScheduleCsv(csv: string): ImportResult {
  const lines = csv.replace(/\r/g, "").split("\n").filter((l) => l.trim());
  const errors: ImportResult["errors"] = [];
  const rows: ScheduleImportRow[] = [];
  const header = lines.shift()?.split(",").map((h) => h.trim().toLowerCase()) ?? [];
  const need = ["route_id", "departure_time", "days", "fare_ngn", "vehicle_plate", "policy"];
  const missing = need.filter((n) => !header.includes(n));
  if (missing.length) return { rows, errors: [{ line: 1, message: `Missing columns: ${missing.join(", ")}` }] };
  lines.forEach((line, i) => {
    const cells = line.split(",").map((c) => c.trim());
    const get = (k: string) => cells[header.indexOf(k)] ?? "";
    const n = i + 2;
    const time = get("departure_time");
    const days = parseDays(get("days"));
    const fare = Number(get("fare_ngn"));
    if (!get("route_id")) return errors.push({ line: n, message: "route_id is required" });
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return errors.push({ line: n, message: `Invalid time "${time}"` });
    if (!days?.length) return errors.push({ line: n, message: `Invalid days "${get("days")}"` });
    if (!(fare >= 500 && fare <= 500000)) return errors.push({ line: n, message: `Fare must be between 500 and 500,000 NGN` });
    if (!["flexible", "standard", "strict"].includes(get("policy"))) return errors.push({ line: n, message: `Unknown policy "${get("policy")}"` });
    rows.push({ routeId: get("route_id"), time, days, fareMinor: Math.round(fare * 100), vehiclePlate: get("vehicle_plate").toUpperCase(), policyId: get("policy") });
  });
  return { rows, errors };
}
