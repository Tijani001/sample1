import { describe, expect, it } from "vitest";
import { parseScheduleCsv } from "@/lib/integrations/csv-import";
import { adapterFor } from "@/lib/integrations/native";

describe("operator integrations", () => {
  it("parses and validates bulk schedule imports", () => {
    const r = parseScheduleCsv(`route_id,departure_time,days,fare_ngn,vehicle_plate,policy
savannah-line:abuja-kano,06:30,Mon-Sat,18500,sl-139-em,standard
savannah-line:abuja-kano,25:00,Daily,18500,SL-1,standard
savannah-line:abuja-kano,07:00,Mon,Wed,Fri,9000,SL-2,flexible
x,08:00,Daily,10,SL-3,standard`);
    expect(r.rows[0]).toMatchObject({ time: "06:30", days: [1, 2, 3, 4, 5, 6], fareMinor: 1850000, vehiclePlate: "SL-139-EM" });
    expect(r.errors.map((e) => e.line)).toEqual([3, 4, 5]);
  });
  it("reports missing columns", () => {
    expect(parseScheduleCsv("route_id,days\nx,Daily").errors[0].message).toMatch(/Missing columns/);
  });
  it("never pretends an API integration exists", () => {
    expect(adapterFor("native").kind).toBe("native");
    expect(() => adapterFor("api")).toThrow(/No api adapter/);
  });
});
