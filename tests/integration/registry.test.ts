import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { connection, createDatabase, getDb } from "@/db";
import {
  adoptions,
  auditEvents,
  benches,
  donors,
  importBatches,
  users,
} from "@/db/schema";
import { adoptionModule } from "@/features/adoptions/service";
import { addDays, parkToday } from "@/features/adoptions/dates";
import { listPublicBenches } from "@/features/benches/queries";
import { saveBench, saveDonor } from "@/features/management/service";
import { runImport } from "@/features/imports/service";
import { checkOrigin, limitGuest, readJson } from "@/features/shared/http";
import { prepareDatabase, testDatabaseUrl } from "../database";

process.env.DATABASE_URL = testDatabaseUrl();
const db = getDb();
const today = parkToday();
const actor = { id: "integration-staff", origin: "staff" as const };
const input = (benchCode = "TEST-001", email = "private@example.com") => ({
  benchCode,
  name: "Private Contact",
  email,
  publicName: "Public Supporter",
  months: 12,
  requestId: randomUUID(),
});
const benchInput = (code = "TEST-001") => ({
  code,
  description: "Test bench near the south path",
  latitude: 40.8895,
  longitude: -73.8965,
  state: "in_service" as const,
});
const adoptionService = adoptionModule(db);
beforeAll(async () => {
  await prepareDatabase(process.env.DATABASE_URL!);
});
beforeEach(async () => {
  await db.execute(
    sql`TRUNCATE import_batch, audit_event, adoption, donor, bench, staff_user, submission_limit CASCADE`,
  );
  await db.insert(users).values({
    id: actor.id,
    name: "Test Staff",
    email: "staff@example.com",
  });
  await db.insert(benches).values({ ...benchInput(), source: "staff" });
});
afterAll(async () => {
  await connection().pool.end();
});

describe("adoption integrity in real PostgreSQL", () => {
  it("permits only one of two concurrent claims from independent connection pools", async () => {
    const second = createDatabase(process.env.DATABASE_URL!);
    try {
      const results = await Promise.allSettled([
        adoptionService.adopt(input()),
        adoptionModule(second.db).adopt(input("TEST-001", "other@example.com")),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(results.find((r) => r.status === "rejected")).toMatchObject({
        reason: { status: 409 },
      });
      expect(await db.select().from(adoptions)).toHaveLength(1);
      expect(await db.select().from(donors)).toHaveLength(1);
    } finally {
      await second.pool.end();
    }
  });
  it("returns the same receipt on retry, including concurrent retries", async () => {
    const request = input();
    const [first, second] = await Promise.all([
      adoptionService.adopt(request),
      adoptionService.adopt(request),
    ]);
    expect(second).toEqual(first);
    expect(await db.select().from(auditEvents)).toHaveLength(1);
    await expect(
      adoptionService.adopt({ ...request, months: 2 }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("enforces nonoverlap even when application checks are bypassed", async () => {
    await adoptionService.adopt(input());
    const [record] = await db.select().from(adoptions);
    await expect(
      db.insert(adoptions).values({
        benchId: record.benchId,
        donorId: record.donorId,
        startsOn: today,
        endsOn: addDays(today, 2),
        source: "staff",
      }),
    ).rejects.toMatchObject({ cause: { code: "23P01" } });
  });
  it("allows adjacent periods and derives expiry without a background job", async () => {
    const previous = await adoptionService.create(
      {
        ...input(),
        startsOn: addDays(today, -31),
        through: addDays(today, -1),
      },
      actor,
    );
    expect((await listPublicBenches(db, today))[0].availability).toBe(
      "available",
    );
    const receipt = await adoptionService.adopt(input());
    expect(receipt.startsOn).toBe(previous.endsOn);
    expect((await listPublicBenches(db, receipt.endsOn))[0].availability).toBe(
      "available",
    );
  });
  it("keeps private contacts out of public results and prevents guest contact overwrites", async () => {
    await adoptionService.adopt(input());
    await db
      .insert(benches)
      .values({ ...benchInput("TEST-002"), source: "staff" });
    const receipt = await adoptionService.adopt({
      ...input("TEST-002"),
      name: "Attempted overwrite",
      publicName: null,
    });
    expect(receipt.publicName).toBeNull();
    expect(
      (await listPublicBenches(db)).find((b) => b.code === "TEST-002"),
    ).toMatchObject({
      availability: "adopted",
      adoption: { publicName: null, startsOn: today },
    });
    expect((await db.select().from(donors))[0].name).toBe("Private Contact");
    const publicData = JSON.stringify(await listPublicBenches(db));
    expect(publicData).toContain("Public Supporter");
    for (const privateValue of [
      "Private Contact",
      "private@example.com",
      "donorId",
      "requestHash",
      "requestId",
    ])
      expect(publicData).not.toContain(privateValue);
    expect(Object.keys(receipt).sort()).toEqual([
      "endsOn",
      "id",
      "publicName",
      "startsOn",
    ]);
  });
  it("cancels immediately while retaining history and rejecting stale edits", async () => {
    const receipt = await adoptionService.adopt(input());
    const cancelled = await adoptionService.change(
      receipt.id,
      { action: "cancel", version: 1 },
      actor,
    );
    expect(cancelled.cancelledOn).toBe(today);
    expect((await listPublicBenches(db))[0].availability).toBe("available");
    await expect(
      adoptionService.change(
        receipt.id,
        { action: "renew", months: 12, version: 1 },
        actor,
      ),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      adoptionService.change(
        receipt.id,
        { action: "renew", months: 12, version: 2 },
        actor,
      ),
    ).rejects.toThrow("Cancelled");
    await adoptionService.adopt(input("TEST-001", "new@example.com"));
    expect(await db.select().from(adoptions)).toHaveLength(2);
    expect(
      await db
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.entityId, receipt.id)),
    ).toHaveLength(2);
  });
  it("extends an active period and creates a fresh period when renewing an expired adoption", async () => {
    const receipt = await adoptionService.adopt(input());
    const renewed = await adoptionService.change(
      receipt.id,
      { action: "renew", months: 12, version: 1 },
      actor,
    );
    expect(renewed.id).toBe(receipt.id);
    expect(renewed.startsOn).toBe(receipt.startsOn);
    expect(renewed.endsOn > receipt.endsOn).toBe(true);
    await db
      .insert(benches)
      .values({ ...benchInput("TEST-002"), source: "staff" });
    const past = await adoptionService.create(
      {
        ...input("TEST-002"),
        startsOn: addDays(today, -40),
        through: addDays(today, -5),
      },
      actor,
    );
    const restarted = await adoptionService.change(
      past.id,
      { action: "renew", months: 2, version: 1 },
      actor,
    );
    expect(restarted.id).not.toBe(past.id);
    expect(restarted.startsOn).toBe(today);
    await expect(
      adoptionService.change(
        past.id,
        { action: "renew", months: 2, version: 1 },
        actor,
      ),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("does not retire an adopted bench or adopt an unavailable bench", async () => {
    const [bench] = await db.select().from(benches);
    const receipt = await adoptionService.adopt(input());
    await expect(
      saveBench(
        { ...benchInput(), state: "retired", version: 1 },
        actor,
        bench.id,
      ),
    ).rejects.toThrow("Cancel the active adoption");
    await saveBench(
      { ...benchInput(), state: "unavailable", version: 1 },
      actor,
      bench.id,
    );
    await adoptionService.change(
      receipt.id,
      { action: "cancel", version: 1 },
      actor,
    );
    await expect(adoptionService.adopt(input())).rejects.toMatchObject({
      status: 409,
    });
    await saveBench(
      { ...benchInput(), state: "retired", version: 2 },
      actor,
      bench.id,
    );
    expect(await listPublicBenches(db)).toHaveLength(0);
  });
  it("corrects adoption credit and dates but rolls back a correction that overlaps history", async () => {
    const receipt = await adoptionService.adopt(input());
    const corrected = await adoptionService.change(
      receipt.id,
      {
        action: "correct",
        version: 1,
        publicName: "Corrected Credit",
        startsOn: today,
        through: addDays(today, 10),
      },
      actor,
    );
    expect(corrected.endsOn).toBe(addDays(today, 11));
    expect((await listPublicBenches(db))[0].adoption?.publicName).toBe(
      "Corrected Credit",
    );
    await adoptionService.create(
      {
        ...input(),
        startsOn: addDays(today, -10),
        through: addDays(today, -1),
      },
      actor,
    );
    await expect(
      adoptionService.change(
        receipt.id,
        {
          action: "correct",
          version: 2,
          publicName: "Overlapping Credit",
          startsOn: addDays(today, -5),
          through: addDays(today, 10),
        },
        actor,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      (
        await db.select().from(adoptions).where(eq(adoptions.id, receipt.id))
      )[0],
    ).toMatchObject({
      publicName: "Corrected Credit",
      startsOn: today,
      version: 2,
    });
  });

  it("does not reactivate an expired adoption by correcting an unavailable bench", async () => {
    const expired = await adoptionService.create(
      {
        ...input(),
        startsOn: addDays(today, -31),
        through: addDays(today, -1),
      },
      actor,
    );
    await saveBench(
      { ...benchInput(), state: "unavailable", version: 1 },
      actor,
      expired.benchId,
    );
    await expect(
      adoptionService.change(
        expired.id,
        {
          action: "correct",
          version: 1,
          publicName: "Corrected Credit",
          startsOn: expired.startsOn,
          through: addDays(today, 10),
        },
        actor,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      (
        await db.select().from(adoptions).where(eq(adoptions.id, expired.id))
      )[0],
    ).toMatchObject({
      endsOn: today,
      version: 1,
      publicName: expired.publicName,
    });
    expect(
      await db
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.entityId, expired.id)),
    ).toHaveLength(1);
  });

  it("allows corrections to an active adoption on a temporarily unavailable bench", async () => {
    const receipt = await adoptionService.adopt(input());
    const [bench] = await db.select().from(benches);
    await saveBench(
      { ...benchInput(), state: "unavailable", version: 1 },
      actor,
      bench.id,
    );
    await adoptionService.change(
      receipt.id,
      {
        action: "correct",
        version: 1,
        publicName: "Corrected Credit",
        startsOn: today,
        through: addDays(today, 10),
      },
      actor,
    );
    expect((await listPublicBenches(db))[0]).toMatchObject({
      availability: "unavailable",
      adoption: { publicName: "Corrected Credit", endsOn: addDays(today, 11) },
    });
  });

  it("versions donor corrections separately from public credit and records the actor", async () => {
    await adoptionService.adopt(input());
    const [donor] = await db.select().from(donors);
    await saveDonor(
      donor.id,
      { name: "Corrected Contact", email: "corrected@example.com", version: 1 },
      actor,
    );
    await expect(
      saveDonor(
        donor.id,
        { name: "Stale Contact", email: donor.email, version: 1 },
        actor,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect((await listPublicBenches(db))[0].adoption?.publicName).toBe(
      "Public Supporter",
    );
    const [event] = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.entityId, donor.id));
    expect(event.actorId).toBe(actor.id);
    expect(event.before).toMatchObject({ name: "Private Contact" });
    expect(event.after).toMatchObject({ name: "Corrected Contact" });
  });
});

describe("atomic CSV imports", () => {
  const benchCsv =
    "bench_code,description,latitude,longitude,state\nCSV-001,Imported bench,40.8895,-73.8965,in_service\nCSV-002,Another bench,40.8896,-73.8966,in_service\n";
  const adoptionCsv = (rows: string[]) =>
    "external_id,bench_code,contact_name,contact_email,public_name,adopted_from,adopted_through,cancelled_on\n" +
    rows.join("\n");
  const row = (id: string) =>
    `${id},TEST-001,CSV Contact,csv@example.com,CSV Supporter,${today},${addDays(today, 30)},`;
  it("previews without writes, commits atomically, and makes commit retries idempotent", async () => {
    const preview = await runImport("benches", benchCsv, actor);
    expect(preview).toMatchObject({ created: 2, errors: [] });
    expect(await db.select().from(benches)).toHaveLength(1);
    expect(await db.select().from(auditEvents)).toHaveLength(0);
    const result = await runImport(
      "benches",
      benchCsv,
      actor,
      preview.fingerprint,
    );
    expect(result.committed).toBe(true);
    expect(
      await runImport("benches", benchCsv, actor, preview.fingerprint),
    ).toEqual(result);
    expect(await db.select().from(benches)).toHaveLength(3);
    expect(await db.select().from(importBatches)).toHaveLength(1);
  });
  it("collects overlap errors inside a file and rolls all successful rows back", async () => {
    const report = await runImport(
      "adoptions",
      adoptionCsv([row("legacy-1"), row("legacy-2")]),
      actor,
    );
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0].row).toBe(3);
    expect(await db.select().from(adoptions)).toHaveLength(0);
    expect(await db.select().from(donors)).toHaveLength(0);
    expect(await db.select().from(auditEvents)).toHaveLength(0);
  });
  it("rejects stale previews without overwriting staff corrections", async () => {
    const csv =
      "bench_code,description,latitude,longitude,state\nTEST-001,CSV edit,40.8895,-73.8965,in_service";
    const preview = await runImport("benches", csv, actor);
    const [bench] = await db.select().from(benches);
    await saveBench(
      { ...benchInput(), description: "Staff correction", version: 1 },
      actor,
      bench.id,
    );
    await expect(
      runImport("benches", csv, actor, preview.fingerprint),
    ).rejects.toMatchObject({ status: 409 });
    expect((await db.select().from(benches))[0].description).toBe(
      "Staff correction",
    );
  });
  it("revalidates when another donor adopts after preview", async () => {
    const csv = adoptionCsv([row("legacy-1")]);
    const preview = await runImport("adoptions", csv, actor);
    await adoptionService.adopt(input());
    await expect(
      runImport("adoptions", csv, actor, preview.fingerprint),
    ).rejects.toMatchObject({ status: 409 });
    expect(await db.select().from(adoptions)).toHaveLength(1);
    expect(
      await db.select().from(donors).where(eq(donors.email, "csv@example.com")),
    ).toHaveLength(0);
  });
  it("skips exact external IDs but rejects changed imported records", async () => {
    const csv = adoptionCsv([row("legacy-1")]);
    const preview = await runImport("adoptions", csv, actor);
    await runImport("adoptions", csv, actor, preview.fingerprint);
    expect(await runImport("adoptions", csv, actor)).toMatchObject({
      unchanged: 1,
      errors: [],
    });
    expect(
      (
        await runImport(
          "adoptions",
          csv.replace("CSV Supporter", "Changed"),
          actor,
        )
      ).errors,
    ).toHaveLength(1);
  });
  it("reports duplicate rows, malformed data, and out-of-park coordinates", async () => {
    expect(
      (
        await runImport(
          "benches",
          benchCsv.replace("CSV-002", "CSV-001"),
          actor,
        )
      ).errors[0].row,
    ).toBe(3);
    expect(
      (await runImport("benches", benchCsv.replace("40.8895", "NaN"), actor))
        .errors,
    ).toHaveLength(1);
    expect(
      (await runImport("benches", benchCsv.replace("40.8895", "0"), actor))
        .warnings,
    ).toHaveLength(1);
    await expect(
      runImport("benches", "wrong,header\na,b", actor),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      runImport("benches", "x".repeat(2 * 1024 * 1024 + 1), actor),
    ).rejects.toMatchObject({ status: 413 });
    expect(await db.select().from(benches)).toHaveLength(1);
  });
});

describe("access and request boundaries", () => {
  it("serves staff records without a session", async () => {
    const { GET } = await import("@/app/api/admin/[...resource]/route");
    const response = await GET(
      new Request("http://localhost:3000/api/admin/records"),
      { params: Promise.resolve({ resource: ["records"] }) },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { benches: unknown[] };
    expect(body.benches).toHaveLength(1);
  });
  it("rejects missing and foreign origins, invalid JSON, and oversized JSON", async () => {
    expect(() =>
      checkOrigin(new Request("http://localhost:3000/api/adoptions")),
    ).toThrow("application");
    expect(() =>
      checkOrigin(
        new Request("http://localhost:3000/api/adoptions", {
          headers: { origin: "https://attacker.example" },
        }),
      ),
    ).toThrow("application");
    expect(() =>
      checkOrigin(
        new Request("http://localhost:3000/api/adoptions", {
          headers: { origin: "http://localhost:3000" },
        }),
      ),
    ).not.toThrow();
    await expect(
      readJson(
        new Request("http://localhost", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{",
        }),
      ),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      readJson(
        new Request("http://localhost", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "x".repeat(16_385),
        }),
      ),
    ).rejects.toMatchObject({ status: 413 });
  });
  it("limits repeated guest attempts using shared database state", async () => {
    const request = new Request("http://localhost:3000/api/adoptions");
    for (let i = 0; i < 20; i++) await limitGuest(request);
    await expect(limitGuest(request)).rejects.toMatchObject({ status: 429 });
    expect(
      await db
        .select()
        .from(adoptions)
        .where(
          and(eq(adoptions.startsOn, today), eq(adoptions.source, "guest")),
        ),
    ).toHaveLength(0);
  });
});
