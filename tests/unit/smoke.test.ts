import { describe, it, expect } from "vitest";
import { createTestDb } from "@/lib/db/client";
import { searchTrips } from "@/lib/services/search";
import { addDaysIso, todayIso } from "@/lib/domain/time";

describe("smoke", () => {
  it("seeds and searches", async () => {
    const t = Date.now();
    const db = await createTestDb();
    console.log("seed ms", Date.now() - t);
    const trips = await searchTrips(db, { from: "lagos", to: "abuja", date: addDaysIso(todayIso(), 3) });
    console.log(trips.length, trips.map((x) => `${x.operator.name} ${x.departureAt} ${x.fare} left ${x.seatsLeft}/${x.capacity}`));
    const n = await db.query(`select status, count(*)::int from bookings group by status`);
    console.log(n);
    expect(trips.length).toBeGreaterThan(0);
  });
});
