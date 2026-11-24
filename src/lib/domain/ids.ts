import crypto from "node:crypto";

// Unambiguous alphabet (no 0/O, 1/I/L) for references people read aloud at a terminal.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function randomCode(len: number) {
  const bytes = crypto.randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

/** Booking reference, e.g. "GR-7K2QXM". ~30 bits; uniqueness is enforced by the database. */
export const bookingReference = () => `GR-${randomCode(6)}`;
export const ticketNumber = () => `TKT-${randomCode(4)}-${randomCode(4)}`;
export const supportReference = () => `SUP-${randomCode(6)}`;
export const paymentReference = (bookingRef: string) => `${bookingRef}-${randomCode(5)}`;

/** 128-bit random URL-safe token for tickets, tracking links and session cookies. */
export const secureToken = (bytes = 16) => crypto.randomBytes(bytes).toString("base64url");
export const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

export function timingSafeEqualStr(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}
