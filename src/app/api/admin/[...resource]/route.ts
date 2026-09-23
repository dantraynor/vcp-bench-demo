import { z } from "zod";
import { demoStaff } from "@/features/management/actor";
import {
  staffRecords,
  history,
  type StaffRecords,
} from "@/features/benches/queries";
import { adoptionModule } from "@/features/adoptions/service";
import { inclusiveThrough } from "@/features/adoptions/dates";
import { saveBench, saveDonor } from "@/features/management/service";
import { filterRecords } from "@/features/management/filter";
import {
  csvExport,
  csvTemplate,
  runImport,
  MAX_CSV_BYTES,
} from "@/features/imports/service";
import {
  route,
  noStore,
  json,
  checkOrigin,
  readJson,
} from "@/features/shared/http";
import { AppError } from "@/features/shared/errors";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ resource: string[] }> };
type ExportKind = "benches" | "adoptions" | "donors";
export function GET(request: Request, context: Context) {
  return route(async () => {
    await demoStaff();
    const {
      resource: [resource, id],
    } = await context.params;
    if (resource === "records") return json(await staffRecords());
    if (resource === "history") return json(await history(z.uuid().parse(id)));
    if (resource === "templates") {
      const kind = z.enum(["benches", "adoptions"]).parse(id);
      return csvResponse(csvTemplate(kind), `${kind}-template.csv`);
    }
    if (resource === "exports") {
      const kind = z.enum(["benches", "adoptions", "donors"]).parse(id);
      const data = await staffRecords();
      const url = new URL(request.url);
      return exportCsv(
        kind,
        data,
        url.searchParams.get("q") ?? "",
        url.searchParams.get("status") ?? "all",
      );
    }
    throw new AppError(404, "Endpoint not found.");
  });
}
export function POST(request: Request, context: Context) {
  return route(async () => {
    checkOrigin(request);
    const actor = await demoStaff();
    const {
      resource: [resource, id],
    } = await context.params;
    if (resource === "imports") {
      if (
        Number(request.headers.get("content-length") ?? 0) >
        2.1 * 1024 * 1024
      )
        throw new AppError(413, "CSV files must be 2 MB or smaller.");
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File) || file.size > MAX_CSV_BYTES)
        throw new AppError(422, "Select a CSV file no larger than 2 MB.");
      const kind = z.enum(["benches", "adoptions"]).parse(form.get("kind"));
      if (id !== "preview" && id !== "commit")
        throw new AppError(404, "Endpoint not found.");
      const fingerprint =
        id === "commit"
          ? z
              .string()
              .regex(/^[a-f0-9]{64}$/)
              .parse(form.get("fingerprint"))
          : undefined;
      const report = await runImport(
        kind,
        await file.text(),
        actor,
        fingerprint,
      );
      return json(report);
    }
    const data = await readJson(request);
    if (resource === "benches" && !id)
      return json(await saveBench(data, actor), 201);
    if (resource === "adoptions")
      return json(
        id
          ? await adoptionModule().change(id, data, actor)
          : await adoptionModule().create(data, actor),
      );
    throw new AppError(404, "Endpoint not found.");
  });
}
export function PATCH(request: Request, context: Context) {
  return route(async () => {
    checkOrigin(request);
    const actor = await demoStaff();
    const {
      resource: [resource, id],
    } = await context.params;
    const data = await readJson(request);
    if (resource === "benches" && id)
      return json(await saveBench(data, actor, id));
    if (resource === "donors" && id)
      return json(await saveDonor(id, data, actor));
    throw new AppError(404, "Endpoint not found.");
  });
}
function exportCsv(
  kind: ExportKind,
  data: StaffRecords,
  query: string,
  status: string,
) {
  switch (kind) {
    case "benches":
      return csvResponse(
        csvExport(
          filterRecords(data.benches, query, status).map((bench) => ({
            bench_code: bench.code,
            description: bench.description,
            latitude: bench.latitude,
            longitude: bench.longitude,
            state: bench.state,
            area: bench.area,
            source: bench.source,
          })),
          [
            "bench_code",
            "description",
            "latitude",
            "longitude",
            "state",
            "area",
            "source",
          ],
        ),
        "benches.csv",
      );
    case "donors":
      return csvResponse(
        csvExport(
          filterRecords(data.donors, query, status).map((donor) => ({
            name: donor.name,
            email: donor.email,
            adoptions: donor.adoptionCount,
          })),
          ["name", "email", "adoptions"],
        ),
        "donors.csv",
      );
    case "adoptions":
      return csvResponse(
        csvExport(
          filterRecords(data.adoptions, query, status).map((adoption) => ({
            external_id: adoption.externalId ?? adoption.id,
            bench_code: adoption.benchCode,
            contact_name: adoption.donorName,
            contact_email: adoption.donorEmail,
            public_name: adoption.publicName ?? "",
            adopted_from: adoption.startsOn,
            adopted_through: inclusiveThrough(adoption.endsOn),
            cancelled_on: adoption.cancelledOn ?? "",
            status: adoption.status,
          })),
          [
            "external_id",
            "bench_code",
            "contact_name",
            "contact_email",
            "public_name",
            "adopted_from",
            "adopted_through",
            "cancelled_on",
            "status",
          ],
        ),
        "adoptions.csv",
      );
    default: {
      const unreachable: never = kind;
      throw new Error(`Unexpected export kind: ${unreachable}`);
    }
  }
}
function csvResponse(csv: string, filename: string) {
  return new Response(csv, {
    headers: {
      ...noStore,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
