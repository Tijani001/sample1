import { z } from "zod";

/** Normalises Nigerian numbers (080…, 23480…, +23480…) and other E.164 numbers to +E.164. */
export function normalizePhone(input: string): string | null {
  const raw = input.replace(/[\s()-]/g, "");
  if (/^0[789][01]\d{8}$/.test(raw)) return `+234${raw.slice(1)}`;
  if (/^234[789][01]\d{8}$/.test(raw)) return `+${raw}`;
  if (/^\+234[789][01]\d{8}$/.test(raw)) return raw;
  if (/^\+[1-9]\d{7,14}$/.test(raw)) return raw;
  return null;
}

export const phoneSchema = z
  .string()
  .trim()
  .min(1, "Enter a phone number")
  .transform((v, ctx) => {
    const n = normalizePhone(v);
    if (!n) {
      ctx.addIssue({ code: "custom", message: "Enter a valid phone number, e.g. 0803 123 4567" });
      return z.NEVER;
    }
    return n;
  });

export const nameSchema = z
  .string()
  .trim()
  .min(2, "Enter the full name as it appears on a valid ID")
  .max(80, "Name is too long")
  .regex(/^[\p{L}][\p{L}\s.'-]+$/u, "Use letters only")
  .refine((v) => v.split(/\s+/).length >= 2, "Enter first and last name");

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address").max(120);

export const passengerSchema = z.object({
  fullName: nameSchema,
  phone: z.union([phoneSchema, z.literal("").transform(() => undefined)]).optional(),
  email: z.union([emailSchema, z.literal("").transform(() => undefined)]).optional(),
  nextOfKinName: z.string().trim().max(80).optional(),
  nextOfKinPhone: z.union([phoneSchema, z.literal("").transform(() => undefined)]).optional(),
});

export const passengersFormSchema = z
  .object({
    contact: z.object({ name: nameSchema, email: emailSchema, phone: phoneSchema }),
    passengers: z.array(passengerSchema).min(1).max(10),
  })
  .superRefine((v, ctx) => {
    const lead = v.passengers[0];
    if (!lead?.nextOfKinName || lead.nextOfKinName.trim().length < 2) {
      ctx.addIssue({ code: "custom", path: ["passengers", 0, "nextOfKinName"], message: "Emergency contact name is required for the lead passenger" });
    }
    if (!lead?.nextOfKinPhone) {
      ctx.addIssue({ code: "custom", path: ["passengers", 0, "nextOfKinPhone"], message: "Emergency contact phone is required for the lead passenger" });
    }
  });

export type PassengersForm = z.input<typeof passengersFormSchema>;

export const searchParamsSchema = z.object({
  from: z.string().min(2).max(40),
  to: z.string().min(2).max(40),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  return: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  pax: z.coerce.number().int().min(1).max(10).default(1),
});

export const PASSENGER_LIMITS = { min: 1, max: 10 } as const;

export const passwordSchema = z.string().min(8, "Use at least 8 characters").max(128);
