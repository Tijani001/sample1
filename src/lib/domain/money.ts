/** All monetary values are integer minor units (kobo for NGN). Never use floats for money. */
export type Minor = number;

const SYMBOLS: Record<string, string> = { NGN: "₦", GHS: "GH₵", KES: "KSh", USD: "$", GBP: "£", EUR: "€" };
const MINOR_DIGITS: Record<string, number> = { NGN: 2, GHS: 2, KES: 2, USD: 2, GBP: 2, EUR: 2 };

export function formatMoney(minor: Minor, currency = "NGN", opts: { showMinor?: boolean } = {}) {
  const digits = MINOR_DIGITS[currency] ?? 2;
  const major = minor / 10 ** digits;
  const showMinor = opts.showMinor ?? minor % 10 ** digits !== 0;
  const n = new Intl.NumberFormat("en-NG", {
    minimumFractionDigits: showMinor ? digits : 0,
    maximumFractionDigits: showMinor ? digits : 0,
  }).format(Math.abs(major));
  return `${minor < 0 ? "−" : ""}${SYMBOLS[currency] ?? currency + " "}${n}`;
}

export const naira = (n: number): Minor => Math.round(n * 100);

/** Percentage of an amount, rounded to the nearest minor unit (banker-safe for display purposes). */
export function percentOf(amount: Minor, pct: number): Minor {
  return Math.round((amount * pct) / 100);
}

export const SUPPORTED_DISPLAY_CURRENCIES = [
  { code: "NGN", label: "Nigerian naira", symbol: "₦" },
] as const;
