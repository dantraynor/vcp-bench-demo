import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import { and, eq, inArray, asc } from "drizzle-orm";
import { z } from "zod";
import { getDb, type Database, type Transaction } from "@/db";
import { benches, adoptions, donors, importBatches } from "@/db/schema";
import {
  ANONYMOUS_SUPPORTER,
  benchInputSchema,
  staffAdoptionSchema,
  dateSchema,
} from "../adoptions/validation";
import {
  hash,
  insertAdoption,
  type IdentifiedActor,
  validatePeriod,
} from "../adoptions/service";
import { writeBench } from "../management/service";
import {
  addDays,
  exclusiveEnd,
  parkToday,
  DEFAULT_ADOPTION_DAYS,
} from "../adoptions/dates";
import { inPark } from "../benches/geography";
import {
  AppError,
  databaseError,
  postgresCode,
  translateDatabaseError,
} from "../shared/errors";

export type ImportKind = "benches" | "adoptions";
const headers = {
  benches: ["bench_code", "description", "latitude", "longitude", "state"],
  adoptions: [
    "external_id",
    "bench_code",
    "contact_name",
    "contact_email",
    "public_name",
    "adopted_from",
    "adopted_through",
    "cancelled_on",
  ],
};
export const MAX_CSV_BYTES = 2 * 1024 * 1024;
export function csvExport(records: object[], columns?: string[]) {
  return stringify(records, { header: true, columns, escape_formulas: true });
}
export function csvTemplate(kind: ImportKind) {
  const today = parkToday();
  return stringify([
    headers[kind],
    kind === "benches"
      ? ["NEW-001", "Location description", "40.8895", "-73.8965", "in_service"]
      : [
          "legacy-001",
          "NEW-001",
          "Sample Donor",
          "donor@example.com",
          "Sample Donor",
          today,
          addDays(today, DEFAULT_ADOPTION_DAYS),
          "",
        ],
  ]);
}
type BenchInput = z.infer<typeof benchInputSchema>;
type AdoptionInput = z.infer<typeof staffAdoptionSchema> & {
  externalId: string;
  cancelledOn: string | null;
};
type ImportRow =
  { row: number; bench: BenchInput } | { row: number; adoption: AdoptionInput };
type RowChange = {
  row: number;
  identifier: string;
  action: "created" | "updated" | "unchanged";
  details: string;
};
export type ImportReport = {
  kind: ImportKind;
  total: number;
  created: number;
  updated: number;
  unchanged: number;
  errors: { row: number; message: string }[];
  warnings: { row: number; message: string }[];
  changes: RowChange[];
  fingerprint: string;
  committed?: boolean;
};
function parseFile(kind: ImportKind, csv: string, today: string) {
  if (Buffer.byteLength(csv, "utf8") > MAX_CSV_BYTES)
    throw new AppError(413, "CSV files must be 2 MB or smaller.");
  let lines: string[][];
  try {
    lines = parse(csv, { bom: true, trim: true, skip_empty_lines: true });
  } catch {
    throw new AppError(
      422,
      "The CSV could not be parsed. Check quotes, commas, and column counts.",
    );
  }
  if (lines.length < 2)
    throw new AppError(422, "Include a header and at least one record.");
  if (lines.length > 2001)
    throw new AppError(413, "Import at most 2,000 records at a time.");
  const fileHeaders = lines[0];
  if (
    new Set(fileHeaders).size !== fileHeaders.length ||
    headers[kind].some((h) => !fileHeaders.includes(h)) ||
    fileHeaders.some((h) => !headers[kind].includes(h))
  )
    throw new AppError(
      422,
      "The column headers do not match the template. Download the current template and keep all its columns.",
    );
  const report: ImportReport = {
    kind,
    total: lines.length - 1,
    created: 0,
    updated: 0,
    unchanged: 0,
    errors: [],
    warnings: [],
    changes: [],
    fingerprint: "",
  };
  const rows: ImportRow[] = [];
  const seen = new Set<string>();
  lines.slice(1).forEach((values, i) => {
    const row = i + 2;
    const value = Object.fromEntries(
      fileHeaders.map((header, j) => [header, values[j]]),
    );
    try {
      if (kind === "benches") {
        if (!value.latitude || !value.longitude)
          throw new Error("Latitude and longitude are required.");
        const bench = benchInputSchema.parse({
          code: value.bench_code,
          description: value.description,
          latitude: Number(value.latitude),
          longitude: Number(value.longitude),
          state: value.state,
        });
        if (seen.has(bench.code))
          throw new Error("Duplicate bench code in this file.");
        seen.add(bench.code);
        if (!inPark(bench.longitude, bench.latitude))
          report.warnings.push({
            row,
            message:
              "This coordinate is outside the official park boundary. Verify it before importing.",
          });
        rows.push({ row, bench });
      } else {
        const adoption = staffAdoptionSchema
          .extend({
            externalId: z.string().trim().min(1).max(120),
            cancelledOn: dateSchema.nullable(),
          })
          .parse({
            externalId: value.external_id,
            benchCode: value.bench_code,
            name: value.contact_name,
            email: value.contact_email,
            publicName: value.public_name || null,
            startsOn: value.adopted_from,
            through: value.adopted_through,
            cancelledOn: value.cancelled_on || null,
          });
        validatePeriod(
          adoption.startsOn,
          exclusiveEnd(adoption.through),
          today,
          adoption.cancelledOn,
        );
        if (seen.has(adoption.externalId))
          throw new Error("Duplicate external ID in this file.");
        seen.add(adoption.externalId);
        rows.push({ row, adoption });
      }
    } catch (error) {
      report.errors.push({
        row,
        message:
          error instanceof z.ZodError
            ? error.issues
                .map((i) => `${i.path.join(".")}: ${i.message}`)
                .join("; ")
            : (error as Error).message,
      });
    }
  });
  return { rows, report };
}
class PreviewRollback extends Error {
  constructor(public report: ImportReport) {
    super("Preview complete");
  }
}
async function stateFingerprint(
  tx: Transaction,
  kind: ImportKind,
  rows: ImportRow[],
  today: string,
) {
  const codes = rows.map((row) =>
    "bench" in row ? row.bench.code : row.adoption.benchCode,
  );
  const benchRows = await tx
    .select()
    .from(benches)
    .where(inArray(benches.code, codes))
    .orderBy(asc(benches.id))
    .for("update");
  const adoptionRows = benchRows.length
    ? await tx
        .select()
        .from(adoptions)
        .where(
          inArray(
            adoptions.benchId,
            benchRows.map((b) => b.id),
          ),
        )
        .orderBy(asc(adoptions.id))
    : [];
  const emails = rows.flatMap((row) =>
    "adoption" in row ? [row.adoption.email] : [],
  );
  const contactRows = emails.length
    ? await tx
        .select()
        .from(donors)
        .where(inArray(donors.email, emails))
        .orderBy(asc(donors.id))
    : [];
  return hash({
    kind,
    rows,
    today,
    benches: benchRows.map((b) => [b.id, b.version]),
    adoptions: adoptionRows.map((a) => [a.id, a.version]),
    donors: contactRows.map((d) => [d.id, d.version]),
  });
}
const benchFields = ["description", "latitude", "longitude", "state"] as const;
function changedBenchFields(
  input: BenchInput,
  existing?: Pick<BenchInput, (typeof benchFields)[number]>,
) {
  return benchFields.filter((key) => !existing || existing[key] !== input[key]);
}
async function applyRow(
  tx: Transaction,
  item: ImportRow,
  actor: IdentifiedActor,
  today: string,
): Promise<RowChange> {
  if ("bench" in item) {
    const [existing] = await tx
      .select()
      .from(benches)
      .where(eq(benches.code, item.bench.code));
    const changed = changedBenchFields(item.bench, existing);
    if (existing && changed.length === 0)
      return {
        row: item.row,
        identifier: item.bench.code,
        action: "unchanged",
        details: "Matches the current inventory.",
      };
    await writeBench(
      tx,
      item.bench,
      actor,
      existing ? { id: existing.id, version: existing.version } : undefined,
    );
    return {
      row: item.row,
      identifier: item.bench.code,
      action: existing ? "updated" : "created",
      details: changed
        .map(
          (key) =>
            `${key}: ${existing ? `${existing[key]} → ` : ""}${item.bench[key]}`,
        )
        .join("; "),
    };
  }
  const input = item.adoption;
  const importHash = hash(input);
  const [existing] = await tx
    .select()
    .from(adoptions)
    .where(eq(adoptions.externalId, input.externalId));
  if (existing) {
    if (existing.importHash === importHash && existing.version === 1)
      return {
        row: item.row,
        identifier: input.externalId,
        action: "unchanged",
        details: "This external ID was already imported with the same details.",
      };
    throw new AppError(
      409,
      "This external ID already exists with changed details. Correct its adoption record individually.",
    );
  }
  await insertAdoption(
    tx,
    { ...input, endsOn: exclusiveEnd(input.through), importHash },
    actor,
    today,
  );
  return {
    row: item.row,
    identifier: input.externalId,
    action: "created",
    details: `${input.benchCode} · ${input.publicName ?? ANONYMOUS_SUPPORTER} · ${input.startsOn} through ${input.through}${input.cancelledOn ? ` · cancelled ${input.cancelledOn}` : ""}`,
  };
}
export async function runImport(
  kind: ImportKind,
  csv: string,
  actor: IdentifiedActor,
  fingerprint?: string,
  db: Database = getDb(),
): Promise<ImportReport> {
  const today = parkToday();
  const { rows, report } = parseFile(kind, csv, today);
  if (report.errors.length) {
    if (fingerprint)
      throw new AppError(
        422,
        "The file contains invalid rows. Preview it again.",
      );
    return report;
  }
  const importActor: IdentifiedActor = { id: actor.id, origin: "import" };
  try {
    return await db.transaction(
      async (tx) => {
        if (fingerprint) {
          const [completed] = await tx
            .select()
            .from(importBatches)
            .where(
              and(
                eq(importBatches.fingerprint, fingerprint),
                eq(importBatches.actorId, actor.id),
              ),
            );
          if (completed) return completed.result as ImportReport;
        }
        report.fingerprint = await stateFingerprint(tx, kind, rows, today);
        if (fingerprint && report.fingerprint !== fingerprint)
          throw new AppError(
            409,
            "Records or file contents changed since this preview. Preview again before importing.",
          );
        for (const item of rows) {
          try {
            // Savepoints let preview collect all database errors while preserving whole-file atomicity.
            const change = await tx.transaction((nested) =>
              applyRow(nested, item, importActor, today),
            );
            report[change.action]++;
            report.changes.push(change);
          } catch (error) {
            const translated = translateDatabaseError(error);
            if (translated) {
              report.errors.push({
                row: item.row,
                message: translated.message,
              });
              continue;
            }
            if (error instanceof AppError) {
              report.errors.push({ row: item.row, message: error.message });
              continue;
            }
            throw error;
          }
        }
        if (!fingerprint || report.errors.length)
          throw new PreviewRollback(report);
        report.committed = true;
        await tx.insert(importBatches).values({
          fingerprint,
          kind,
          actorId: actor.id,
          result: report,
        });
        return report;
      },
      { isolationLevel: "serializable" },
    );
  } catch (error) {
    if (error instanceof PreviewRollback) {
      if (fingerprint)
        throw new AppError(
          409,
          "The import could not be committed. No records were changed. Preview again to see row errors.",
        );
      return error.report;
    }
    const code = postgresCode(error);
    if (code === "40001" || code === "40P01")
      throw new AppError(
        409,
        "Records changed during the import. Nothing was committed. Preview and try again.",
      );
    return databaseError(error);
  }
}
