import { sql } from "drizzle-orm";
import { connection } from "../src/db/index";
import { benches, donors, adoptions } from "../src/db/schema";
import { inPark, resolveArea } from "../src/features/benches/geography";
import { parkToday, addDays, addMonths } from "../src/features/adoptions/dates";
let randomState = 20260922;
function random() {
  randomState = (1664525 * randomState + 1013904223) >>> 0;
  return randomState / 4294967296;
}
const { db, pool } = connection();
try {
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(520092)`);
    const [existing] = await tx
      .select({ id: benches.id })
      .from(benches)
      .limit(1);
    if (existing) {
      console.info(
        "Inventory already exists; seed skipped without modifying records.",
      );
      return;
    }
    const day = parkToday();
    const names = [
      "The Rivera Family",
      "Friends of the Old Croton Trail",
      "In memory of Eleanor",
      "The Chen Family",
      "North Bronx Runners",
      "The Parkside Book Club",
      "The Williams Family",
      "For everyone who takes a moment",
      "The Patel Family",
      "Woodlawn Neighbors",
      "The Garden Volunteers",
      "In celebration of new beginnings",
    ];
    for (let i = 1; i <= 520; i++) {
      let longitude: number, latitude: number;
      do {
        longitude = -73.912 + random() * 0.049;
        latitude = 40.875 + random() * 0.042;
      } while (!inPark(longitude, latitude));
      longitude = Number(longitude.toFixed(6));
      latitude = Number(latitude.toFixed(6));
      const [bench] = await tx
        .insert(benches)
        .values({
          code: `VCP-${String(i).padStart(3, "0")}`,
          description: `Illustrative bench in ${resolveArea(longitude, latitude)}.`,
          longitude,
          latitude,
          source: "sample",
          state: i % 23 === 0 ? "unavailable" : "in_service",
        })
        .returning();
      if (i % 4 === 0 || i % 13 === 0 || i % 17 === 0) {
        const [donor] = await tx
          .insert(donors)
          .values({
            name: names[i % names.length],
            email: `supporter-${i}@example.com`,
          })
          .returning();
        const cancelled = i % 17 === 0;
        const expired = !cancelled && i % 13 === 0;
        const startsOn = addDays(day, -60 - i);
        const endsOn = expired
          ? addDays(day, -10)
          : i % 12 === 0
            ? addDays(day, 7 + (i % 20))
            : addMonths(day, 12 + (i % 12));
        await tx.insert(adoptions).values({
          benchId: bench.id,
          donorId: donor.id,
          publicName: i % 28 === 0 ? null : donor.name,
          startsOn,
          endsOn,
          cancelledOn: cancelled ? addDays(day, -5) : null,
          source: "sample",
        });
      }
    }
    console.info(
      "Seeded 520 illustrative benches and sample adoption histories.",
    );
  });
} finally {
  await pool.end();
}
