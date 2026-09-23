import { createHash } from "node:crypto";
import { and, eq, isNull, lte, gt } from "drizzle-orm";
import { getDb, type Database, type Transaction } from "@/db";
import { adoptions, benches, donors, auditEvents } from "@/db/schema";
import { exclusiveEnd, addMonths, parkToday } from "./dates";
import {
  guestAdoptionSchema,
  staffAdoptionSchema,
  dateSchema,
  publicNameSchema,
  versionSchema,
} from "./validation";
import {
  AppError,
  assertVersion,
  bumpVersion,
  databaseError,
} from "../shared/errors";
import { z } from "zod";

export type Actor =
  { id: null; origin: "guest" } | { id: string; origin: "staff" | "import" };
export type IdentifiedActor = Extract<Actor, { id: string }>;
export const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export async function audit(
  tx: Transaction,
  actor: Actor,
  entityType: string,
  entityId: string,
  action: string,
  before: unknown,
  after: unknown,
) {
  await tx.insert(auditEvents).values({
    entityType,
    entityId,
    action,
    actorId: actor.id,
    origin: actor.origin,
    before,
    after,
  });
}
export function activeWhere(today: string) {
  return and(
    isNull(adoptions.cancelledOn),
    lte(adoptions.startsOn, today),
    gt(adoptions.endsOn, today),
  );
}
export async function contact(
  tx: Transaction,
  input: { name: string; email: string },
) {
  const [created] = await tx
    .insert(donors)
    .values(input)
    .onConflictDoNothing({ target: donors.email })
    .returning();
  if (created) return created;
  const [existing] = await tx
    .select()
    .from(donors)
    .where(eq(donors.email, input.email));
  if (!existing)
    throw new AppError(409, "The contact could not be saved. Try again.");
  return existing;
}
export type AdoptionRecordInput = {
  benchCode: string;
  name: string;
  email: string;
  publicName: string | null;
  startsOn: string;
  endsOn: string;
  cancelledOn?: string | null;
  externalId?: string;
  importHash?: string;
  requestId?: string;
  requestHash?: string;
};
export function validatePeriod(
  startsOn: string,
  endsOn: string,
  today: string,
  cancelledOn?: string | null,
) {
  dateSchema.parse(startsOn);
  dateSchema.parse(endsOn);
  if (startsOn > today)
    throw new AppError(
      422,
      "Future reservations are not supported. Choose today or an earlier date.",
    );
  if (endsOn <= startsOn)
    throw new AppError(
      422,
      "The last adopted day must be on or after the start date.",
    );
  if (cancelledOn) {
    dateSchema.parse(cancelledOn);
    if (cancelledOn < startsOn || cancelledOn > today)
      throw new AppError(
        422,
        "Cancellation must be between the start date and today.",
      );
  }
}
export async function insertAdoption(
  tx: Transaction,
  input: AdoptionRecordInput,
  actor: Actor,
  today: string,
) {
  validatePeriod(input.startsOn, input.endsOn, today, input.cancelledOn);
  const [bench] = await tx
    .select()
    .from(benches)
    .where(eq(benches.code, input.benchCode))
    .for("update");
  if (!bench) throw new AppError(404, "Bench not found.");
  if (input.requestId) {
    const [existing] = await tx
      .select()
      .from(adoptions)
      .where(eq(adoptions.requestId, input.requestId));
    if (existing) {
      if (existing.requestHash !== input.requestHash)
        throw new AppError(
          409,
          "This request ID was already used for different details. Start a new request.",
        );
      return existing;
    }
  }
  if (
    !input.cancelledOn &&
    input.endsOn > today &&
    bench.state !== "in_service"
  )
    throw new AppError(
      409,
      "This bench is currently unavailable for adoption.",
    );
  const donor = await contact(tx, { name: input.name, email: input.email });
  const [record] = await tx
    .insert(adoptions)
    .values({
      benchId: bench.id,
      donorId: donor.id,
      publicName: input.publicName,
      startsOn: input.startsOn,
      endsOn: input.endsOn,
      cancelledOn: input.cancelledOn,
      source: actor.origin,
      externalId: input.externalId,
      importHash: input.importHash,
      requestId: input.requestId,
      requestHash: input.requestHash,
    })
    .returning();
  await audit(tx, actor, "adoption", record.id, "created", null, record);
  return record;
}

export function adoptionModule(
  db: Database = getDb(),
  today: () => string = parkToday,
) {
  return {
    async adopt(raw: unknown) {
      const input = guestAdoptionSchema.parse(raw);
      const startsOn = today();
      const record = await db
        .transaction((tx) =>
          insertAdoption(
            tx,
            {
              ...input,
              startsOn,
              endsOn: addMonths(startsOn, input.months),
              requestHash: hash(input),
            },
            { id: null, origin: "guest" },
            startsOn,
          ),
        )
        .catch(databaseError);
      return {
        id: record.id,
        publicName: record.publicName,
        startsOn: record.startsOn,
        endsOn: record.endsOn,
      };
    },
    async create(raw: unknown, actor: Actor) {
      const input = staffAdoptionSchema.parse(raw);
      return db
        .transaction((tx) =>
          insertAdoption(
            tx,
            { ...input, endsOn: exclusiveEnd(input.through) },
            actor,
            today(),
          ),
        )
        .catch(databaseError);
    },
    async change(id: string, raw: unknown, actor: Actor) {
      z.uuid().parse(id);
      const input = z
        .discriminatedUnion("action", [
          z.object({
            action: z.literal("cancel"),
            version: versionSchema,
          }),
          z.object({
            action: z.literal("renew"),
            version: versionSchema,
            months: z.number().int().min(1).max(120),
          }),
          z.object({
            action: z.literal("correct"),
            version: versionSchema,
            publicName: publicNameSchema,
            startsOn: dateSchema,
            through: dateSchema,
          }),
        ])
        .parse(raw);
      return db
        .transaction(async (tx) => {
          // Always acquire the bench lock before the adoption lock.
          const [reference] = await tx
            .select({ benchId: adoptions.benchId })
            .from(adoptions)
            .where(eq(adoptions.id, id));
          if (!reference) throw new AppError(404, "Adoption not found.");
          const [bench] = await tx
            .select()
            .from(benches)
            .where(eq(benches.id, reference.benchId))
            .for("update");
          const [existing] = await tx
            .select()
            .from(adoptions)
            .where(eq(adoptions.id, id))
            .for("update");
          assertVersion(existing.version, input.version);
          const day = today();
          if (input.action === "renew" && existing.cancelledOn)
            throw new AppError(
              409,
              "Cancelled adoptions cannot be renewed. Create a new adoption.",
            );
          if (input.action === "renew" && bench.state !== "in_service")
            throw new AppError(
              409,
              "Restore this bench to service before renewing.",
            );
          if (input.action === "renew" && existing.endsOn <= day) {
            const [donor] = await tx
              .select()
              .from(donors)
              .where(eq(donors.id, existing.donorId));
            const renewed = await insertAdoption(
              tx,
              {
                benchCode: bench.code,
                name: donor.name,
                email: donor.email,
                publicName: existing.publicName,
                startsOn: day,
                endsOn: addMonths(day, input.months),
              },
              actor,
              day,
            );
            // Version the original as well so duplicate renewal requests cannot create another period.
            await tx
              .update(adoptions)
              .set(bumpVersion(existing))
              .where(eq(adoptions.id, id));
            await audit(
              tx,
              actor,
              "adoption",
              id,
              "renewed_as_new_period",
              existing,
              { adoptionId: renewed.id },
            );
            return renewed;
          }
          let changes: Partial<typeof adoptions.$inferInsert>;
          if (input.action === "cancel") {
            if (existing.cancelledOn)
              throw new AppError(409, "This adoption is already cancelled.");
            if (existing.endsOn <= day)
              throw new AppError(409, "This adoption has already expired.");
            changes = { cancelledOn: day };
          } else if (input.action === "renew") {
            changes = { endsOn: addMonths(existing.endsOn, input.months) };
          } else {
            const endsOn = exclusiveEnd(input.through);
            validatePeriod(input.startsOn, endsOn, day, existing.cancelledOn);
            if (
              !existing.cancelledOn &&
              endsOn > day &&
              bench.state === "retired"
            )
              throw new AppError(
                409,
                "A retired bench cannot have an active adoption.",
              );
            if (
              !existing.cancelledOn &&
              endsOn > day &&
              existing.endsOn <= day &&
              bench.state === "unavailable"
            )
              throw new AppError(
                409,
                "Restore this bench to service before reactivating an adoption.",
              );
            changes = {
              startsOn: input.startsOn,
              endsOn,
              publicName: input.publicName,
            };
          }
          const [updated] = await tx
            .update(adoptions)
            .set({
              ...changes,
              ...bumpVersion(existing),
            })
            .where(eq(adoptions.id, id))
            .returning();
          await audit(
            tx,
            actor,
            "adoption",
            id,
            input.action,
            existing,
            updated,
          );
          return updated;
        })
        .catch(databaseError);
    },
  };
}
