import { eq, ne, and, asc, desc, getTableColumns } from "drizzle-orm";
import { getDb, type Database } from "@/db";
import { benches, adoptions, donors, auditEvents, users } from "@/db/schema";
import { activeWhere } from "../adoptions/service";
import { parkToday, adoptionStatus } from "../adoptions/dates";
import { resolveArea } from "./geography";

function publicBenchSelect(db: Database, today: string) {
  return db
    .select({
      id: benches.id,
      code: benches.code,
      description: benches.description,
      latitude: benches.latitude,
      longitude: benches.longitude,
      state: benches.state,
      source: benches.source,
      // Drizzle uses the first selected field to detect a missing left-joined row.
      // Begin with a NOT NULL column: anonymous credit is a real adoption, not an absent row.
      adoption: {
        startsOn: adoptions.startsOn,
        endsOn: adoptions.endsOn,
        publicName: adoptions.publicName,
      },
    })
    .from(benches)
    .leftJoin(
      adoptions,
      and(eq(benches.id, adoptions.benchId), activeWhere(today)),
    );
}
function presentPublicBench<
  T extends {
    longitude: number;
    latitude: number;
    state: string;
    adoption: unknown;
  },
>(record: T) {
  return {
    ...record,
    area: resolveArea(record.longitude, record.latitude),
    availability:
      record.state === "unavailable"
        ? ("unavailable" as const)
        : record.adoption
          ? ("adopted" as const)
          : ("available" as const),
  };
}
export async function listPublicBenches(
  db: Database = getDb(),
  today = parkToday(),
) {
  const records = await publicBenchSelect(db, today)
    .where(ne(benches.state, "retired"))
    .orderBy(asc(benches.code));
  return records.map(presentPublicBench);
}
export async function publicBench(
  code: string,
  db: Database = getDb(),
  today = parkToday(),
) {
  const [record] = await publicBenchSelect(db, today)
    .where(and(eq(benches.code, code), ne(benches.state, "retired")))
    .limit(1);
  return record ? presentPublicBench(record) : null;
}
export type PublicBench = Awaited<ReturnType<typeof listPublicBenches>>[number];
export async function staffRecords(db: Database = getDb()) {
  const day = parkToday();
  const [benchRows, adoptionRows, donorRows] = await Promise.all([
    db.select().from(benches).orderBy(asc(benches.code)),
    db
      .select({
        adoption: adoptions,
        benchCode: benches.code,
        donorName: donors.name,
        donorEmail: donors.email,
      })
      .from(adoptions)
      .innerJoin(benches, eq(benches.id, adoptions.benchId))
      .innerJoin(donors, eq(donors.id, adoptions.donorId))
      .orderBy(desc(adoptions.createdAt)),
    db.select().from(donors).orderBy(asc(donors.name)),
  ]);
  const adoptionRecords = adoptionRows.map(({ adoption, ...details }) => ({
    ...adoption,
    ...details,
    status: adoptionStatus(adoption, day),
  }));
  const active = adoptionRecords.filter((a) => a.status === "active");
  const claimedIds = new Set(active.map((a) => a.benchId));
  const adoptionCountByDonor = new Map<string, number>();
  for (const adoption of adoptionRecords) {
    adoptionCountByDonor.set(
      adoption.donorId,
      (adoptionCountByDonor.get(adoption.donorId) ?? 0) + 1,
    );
  }
  return {
    benches: benchRows.map((b) => ({
      ...b,
      area: resolveArea(b.longitude, b.latitude),
      adopted: claimedIds.has(b.id),
    })),
    adoptions: adoptionRecords,
    donors: donorRows.map((donor) => ({
      ...donor,
      adoptionCount: adoptionCountByDonor.get(donor.id) ?? 0,
    })),
    counts: {
      inventory: benchRows.filter((b) => b.state !== "retired").length,
      available: benchRows.filter(
        (b) => b.state === "in_service" && !claimedIds.has(b.id),
      ).length,
      active: active.length,
    },
    today: day,
  };
}
export type StaffRecords = Awaited<ReturnType<typeof staffRecords>>;
export async function history(entityId: string) {
  return getDb()
    .select({ ...getTableColumns(auditEvents), actorName: users.name })
    .from(auditEvents)
    .leftJoin(users, eq(auditEvents.actorId, users.id))
    .where(eq(auditEvents.entityId, entityId))
    .orderBy(desc(auditEvents.createdAt));
}
