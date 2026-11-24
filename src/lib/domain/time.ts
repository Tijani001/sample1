export const DEFAULT_TZ = "Africa/Lagos";

const fmt = (tz: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, ...o });

export function formatTime(d: Date | string, tz = DEFAULT_TZ) {
  return fmt(tz, { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(d));
}
export function formatDate(d: Date | string, tz = DEFAULT_TZ, style: "short" | "long" | "weekday" = "short") {
  const o: Intl.DateTimeFormatOptions =
    style === "long" ? { weekday: "long", day: "numeric", month: "long", year: "numeric" }
    : style === "weekday" ? { weekday: "short", day: "numeric", month: "short" }
    : { day: "numeric", month: "short", year: "numeric" };
  return fmt(tz, o).format(new Date(d));
}
export function formatDuration(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h === 0 ? `${m}m` : m === 0 ? `${h}h` : `${h}h ${m}m`;
}
/** YYYY-MM-DD for a date as seen in the given time zone. */
export function isoDateInTz(d: Date, tz = DEFAULT_TZ) {
  const parts = fmt(tz, { year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function todayIso(tz = DEFAULT_TZ) {
  return isoDateInTz(new Date(), tz);
}
export function addDaysIso(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function isIsoDate(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}
/** Days between two ISO dates (b - a). */
export function diffDaysIso(a: string, b: string) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400_000);
}
export function dayOffsetLabel(departure: Date, arrival: Date, tz = DEFAULT_TZ) {
  const d = diffDaysIso(isoDateInTz(departure, tz), isoDateInTz(arrival, tz));
  return d > 0 ? `+${d}` : "";
}

/** Current time in ms. Wrapped so server components read "now" once per render explicitly. */
export const nowMs = () => Date.now();
