/**
 * Vehicle seat layout grammar.
 *
 * A layout is described top (front of vehicle) to bottom (rear) as rows of characters:
 *   D  driver's position        S  standard passenger seat     P  premium passenger seat
 *   _  aisle / walkway          .  empty floor space
 * Doors are declared separately so they can sit on either side of any row.
 *
 * Seats are numbered 1..N in reading order (left→right, front→back). Operators can define their own
 * layouts with the same grammar; nothing in the UI is hard-coded to a vehicle type.
 */

export type LayoutSpec = {
  rows: string[];
  doors?: { row: number; side: "left" | "right" }[];
};

export type LayoutCell =
  | { kind: "seat"; seatNo: string; premium: boolean; row: number; col: number }
  | { kind: "driver"; row: number; col: number }
  | { kind: "aisle"; row: number; col: number }
  | { kind: "empty"; row: number; col: number };

export type ParsedLayout = {
  width: number;
  rows: LayoutCell[][];
  seats: Extract<LayoutCell, { kind: "seat" }>[];
  doors: { row: number; side: "left" | "right" }[];
};

const VALID = /^[DSP_.]+$/;

export function validateLayout(spec: LayoutSpec): string[] {
  const errors: string[] = [];
  if (!Array.isArray(spec.rows) || spec.rows.length === 0) errors.push("Layout needs at least one row.");
  if (spec.rows.length > 30) errors.push("Layouts are limited to 30 rows.");
  spec.rows.forEach((r, i) => {
    if (!VALID.test(r)) errors.push(`Row ${i + 1} contains unsupported characters.`);
    if (r.length > 6) errors.push(`Row ${i + 1} is wider than 6 positions.`);
  });
  const drivers = spec.rows.join("").split("D").length - 1;
  if (drivers !== 1) errors.push("Layout must contain exactly one driver position.");
  const seats = spec.rows.join("").replace(/[^SP]/g, "").length;
  if (seats < 1) errors.push("Layout must contain at least one passenger seat.");
  for (const d of spec.doors ?? []) {
    if (d.row < 0 || d.row >= spec.rows.length) errors.push("Door row is outside the layout.");
  }
  return errors;
}

export function parseLayout(spec: LayoutSpec): ParsedLayout {
  const width = Math.max(...spec.rows.map((r) => r.length));
  let n = 0;
  const seats: ParsedLayout["seats"] = [];
  const rows = spec.rows.map((r, row) =>
    Array.from({ length: width }, (_, col): LayoutCell => {
      const ch = r[col] ?? ".";
      if (ch === "S" || ch === "P") {
        n += 1;
        const cell = { kind: "seat" as const, seatNo: String(n), premium: ch === "P", row, col };
        seats.push(cell);
        return cell;
      }
      if (ch === "D") return { kind: "driver", row, col };
      if (ch === "_") return { kind: "aisle", row, col };
      return { kind: "empty", row, col };
    }),
  );
  return { width, rows, seats, doors: spec.doors ?? [] };
}

export function seatCount(spec: LayoutSpec) {
  return spec.rows.join("").replace(/[^SP]/g, "").length;
}

/** Goroada's built-in layout templates. Operators may clone and edit these. */
export const LAYOUT_TEMPLATES: Record<string, { name: string; spec: LayoutSpec; premiumSurcharge: number; category: "car" | "suv" | "minivan" | "bus" | "coach" }> = {
  "car-4": {
    name: "4-seater car",
    category: "car",
    premiumSurcharge: 0,
    spec: { rows: ["D.S", "SSS"], doors: [] },
  },
  "suv-6": {
    name: "6-seater SUV",
    category: "suv",
    premiumSurcharge: 0,
    spec: { rows: ["D.S", "S_S", "SSS"], doors: [{ row: 1, side: "right" }] },
  },
  "minivan-7": {
    name: "7-seater minivan",
    category: "minivan",
    premiumSurcharge: 0,
    spec: { rows: ["D.S", "SSS", "SSS"], doors: [{ row: 1, side: "right" }] },
  },
  "bus-14": {
    name: "14-seater bus",
    category: "bus",
    premiumSurcharge: 0,
    spec: { rows: ["D.SS", "SS_S", "SS_S", "SS_S", "SSS."], doors: [{ row: 1, side: "right" }] },
  },
  "bus-18": {
    name: "18-seater bus",
    category: "bus",
    premiumSurcharge: 0,
    spec: { rows: ["D.SS", "SS_S", "SS_S", "SS_S", "SS_S", "SSSS"], doors: [{ row: 1, side: "right" }] },
  },
  "bus-30": {
    name: "30-seater bus",
    category: "bus",
    premiumSurcharge: 0,
    spec: {
      rows: ["D._SS", "SS_SS", "SS_SS", "SS_SS", "SS_SS", "SS_SS", "SS_S.", "SSSSS"],
      doors: [{ row: 0, side: "right" }],
    },
  },
  "coach-exec-36": {
    name: "Executive coach (2+1)",
    category: "coach",
    premiumSurcharge: 150000,
    spec: {
      rows: ["D_..", "PP_P", "PP_P", "SS_S", "SS_S", "SS_S", "SS_S", "SS_S", "SS_S", "SS_S", "SS_S", "SS_S", "SS_S"],
      doors: [{ row: 0, side: "right" }, { row: 7, side: "right" }],
    },
  },
  "coach-std-44": {
    name: "Standard coach (2+2)",
    category: "coach",
    premiumSurcharge: 0,
    spec: {
      rows: ["D_...", ...Array.from({ length: 11 }, () => "SS_SS")],
      doors: [{ row: 0, side: "right" }, { row: 6, side: "right" }],
    },
  },
};
