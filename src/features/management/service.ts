import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { getDb, type Transaction } from "@/db";
import { adoptions, benches, donors } from "@/db/schema";
import {
  benchInputSchema,
  contactSchema,
  versionSchema,
} from "../adoptions/validation";
import { activeWhere, audit, type Actor } from "../adoptions/service";
import { parkToday } from "../adoptions/dates";
import {
  AppError,
  assertVersion,
  bumpVersion,
  databaseError,
} from "../shared/errors";

export async function writeBench(
  tx: Transaction,
  raw: unknown,
  actor: Actor,
  target?: { id: string; version: number },
  today = parkToday(),
) {
  const input = benchInputSchema.parse(raw);
  if (!target) {
    const [created] = await tx
      .insert(benches)
      .values({
        ...input,
        source: actor.origin === "import" ? "import" : "staff",
      })
      .returning();
    await audit(tx, actor, "bench", created.id, "created", null, created);
    return created;
  }
  const [existing] = await tx
    .select()
    .from(benches)
    .where(eq(benches.id, target.id))
    .for("update");
  if (!existing) throw new AppError(404, "Bench not found.");
  assertVersion(existing.version, target.version);
  if (input.code !== existing.code)
    throw new AppError(
      422,
      "Bench codes are permanent identifiers and cannot be changed.",
    );
  if (input.state === "retired") {
    const [active] = await tx
      .select({ id: adoptions.id })
      .from(adoptions)
      .where(and(eq(adoptions.benchId, target.id), activeWhere(today)))
      .limit(1);
    if (active)
      throw new AppError(
        409,
        "Cancel the active adoption before retiring this bench.",
      );
  }
  const [updated] = await tx
    .update(benches)
    .set({ ...input, ...bumpVersion(existing) })
    .where(eq(benches.id, target.id))
    .returning();
  await audit(tx, actor, "bench", target.id, "updated", existing, updated);
  return updated;
}
export async function saveBench(raw: unknown, actor: Actor, id?: string) {
  const target = id
    ? {
        id: z.uuid().parse(id),
        version: z.object({ version: versionSchema }).parse(raw).version,
      }
    : undefined;
  return getDb()
    .transaction((tx) => writeBench(tx, raw, actor, target))
    .catch(databaseError);
}
export async function saveDonor(id: string, raw: unknown, actor: Actor) {
  z.uuid().parse(id);
  const input = contactSchema.extend({ version: versionSchema }).parse(raw);
  return getDb()
    .transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(donors)
        .where(eq(donors.id, id))
        .for("update");
      if (!existing) throw new AppError(404, "Donor not found.");
      assertVersion(existing.version, input.version);
      const [updated] = await tx
        .update(donors)
        .set({
          name: input.name,
          email: input.email,
          ...bumpVersion(existing),
        })
        .where(eq(donors.id, id))
        .returning();
      await audit(tx, actor, "donor", id, "updated", existing, updated);
      return updated;
    })
    .catch(databaseError);
}
