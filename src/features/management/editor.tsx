"use client";
import { useEffect, useState } from "react";
import type { StaffRecords } from "../benches/queries";
import { requestJson, jsonRequest } from "../shared/client";
import { Badge, Alert, Loading, Modal } from "../shared/ui";
import {
  addDays,
  DEFAULT_ADOPTION_DAYS,
  formatDate,
  inclusiveThrough,
} from "../adoptions/dates";
import { ANONYMOUS_SUPPORTER } from "../adoptions/validation";
type Bench = StaffRecords["benches"][number];
type Adoption = StaffRecords["adoptions"][number];
type Donor = StaffRecords["donors"][number];
export type Edit =
  | { kind: "bench"; row?: Bench }
  | { kind: "adoption"; row?: Adoption }
  | { kind: "donor"; row: Donor }
  | { kind: "renew" | "cancel"; row: Adoption }
  | { kind: "donorHistory"; row: Donor }
  | { kind: "history"; row: Adoption | Bench | Donor };
export function EditDialog({
  edit,
  data,
  onClose,
  onSaved,
}: {
  edit: Edit;
  data: StaffRecords;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const title =
    edit.kind === "bench"
      ? edit.row
        ? `Edit ${edit.row.code}`
        : "Add bench"
      : edit.kind === "donor"
        ? "Edit donor contact"
        : edit.kind === "renew"
          ? `Renew ${edit.row.benchCode}`
          : edit.kind === "cancel"
            ? `Cancel adoption on ${edit.row.benchCode}`
            : edit.kind === "history"
              ? "Record history"
              : edit.kind === "donorHistory"
                ? edit.row.name
                : edit.row
                  ? `Correct adoption on ${edit.row.benchCode}`
                  : "Create adoption";
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const values = Object.fromEntries(form);
    try {
      if (edit.kind === "bench")
        await requestJson(
          `/api/admin/benches${edit.row ? `/${edit.row.id}` : ""}`,
          jsonRequest(edit.row ? "PATCH" : "POST", {
            ...values,
            latitude: Number(values.latitude),
            longitude: Number(values.longitude),
            version: edit.row?.version,
          }),
        );
      else if (edit.kind === "donor")
        await requestJson(
          `/api/admin/donors/${edit.row.id}`,
          jsonRequest("PATCH", { ...values, version: edit.row.version }),
        );
      else if (edit.kind === "renew" || edit.kind === "cancel")
        await requestJson(
          `/api/admin/adoptions/${edit.row.id}`,
          jsonRequest("POST", {
            action: edit.kind,
            version: edit.row.version,
            ...(edit.kind === "renew" ? { months: Number(values.months) } : {}),
          }),
        );
      else if (edit.kind === "adoption")
        await requestJson(
          `/api/admin/adoptions${edit.row ? `/${edit.row.id}` : ""}`,
          jsonRequest("POST", {
            ...values,
            publicName: values.publicName || null,
            ...(edit.row
              ? { action: "correct", version: edit.row.version }
              : {}),
          }),
        );
      await onSaved();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={title} onClose={onClose}>
      {edit.kind === "history" ? (
        <HistoryPanel id={edit.row.id} />
      ) : edit.kind === "donorHistory" ? (
        <div className="modal-body">
          <p className="muted">{edit.row.email} · Private staff record</p>
          {data.adoptions
            .filter((a) => a.donorId === edit.row.id)
            .map((a) => (
              <div className="history-entry" key={a.id}>
                <strong>
                  {a.benchCode} <Badge status={a.status} />
                </strong>
                <p>
                  {formatDate(a.startsOn)} —{" "}
                  {formatDate(inclusiveThrough(a.endsOn))}
                </p>
                <small>
                  Public credit: {a.publicName ?? ANONYMOUS_SUPPORTER}
                </small>
              </div>
            ))}
        </div>
      ) : (
        <form className="form-stack modal-body" onSubmit={submit}>
          {edit.kind === "bench" && (
            <>
              <label>
                Bench code
                <input
                  name="code"
                  required
                  defaultValue={edit.row?.code}
                  readOnly={!!edit.row}
                  placeholder="VCP-521"
                />
                <small>
                  Permanent identifier; use letters, numbers, and hyphens.
                </small>
              </label>
              <label>
                Location description
                <textarea
                  name="description"
                  required
                  minLength={3}
                  maxLength={300}
                  defaultValue={edit.row?.description}
                />
              </label>
              <div className="form-columns">
                <label>
                  Latitude
                  <input
                    name="latitude"
                    type="number"
                    step="any"
                    min={-90}
                    max={90}
                    required
                    defaultValue={edit.row?.latitude}
                  />
                </label>
                <label>
                  Longitude
                  <input
                    name="longitude"
                    type="number"
                    step="any"
                    min={-180}
                    max={180}
                    required
                    defaultValue={edit.row?.longitude}
                  />
                </label>
              </div>
              <label>
                Operational state
                <select
                  name="state"
                  defaultValue={edit.row?.state ?? "in_service"}
                >
                  <option value="in_service">In service</option>
                  <option value="unavailable">Unavailable</option>
                  <option value="retired">Retired</option>
                </select>
                <small>
                  Retirement preserves history. Cancel any active adoption
                  first.
                </small>
              </label>
            </>
          )}
          {edit.kind === "donor" && (
            <>
              <label>
                Contact name
                <input
                  name="name"
                  required
                  minLength={2}
                  maxLength={100}
                  defaultValue={edit.row.name}
                />
              </label>
              <label>
                Email address
                <input
                  name="email"
                  type="email"
                  required
                  defaultValue={edit.row.email}
                />
              </label>
              <p className="muted">
                These fields are private. Public credit is edited on the
                adoption record.
              </p>
            </>
          )}
          {edit.kind === "adoption" && (
            <>
              {!edit.row && (
                <>
                  <label>
                    Bench
                    <select name="benchCode" aria-label="Bench" required>
                      <option value="">Select a bench</option>
                      {data.benches.map((b) => (
                        <option key={b.id} value={b.code}>
                          {b.code} · {b.area}
                          {b.adopted ? " · Adopted" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Contact name
                    <input name="name" required minLength={2} maxLength={100} />
                  </label>
                  <label>
                    Contact email
                    <input name="email" type="email" required />
                  </label>
                </>
              )}
              <label>
                Public display name
                <input
                  name="publicName"
                  maxLength={100}
                  defaultValue={edit.row?.publicName ?? ""}
                />
                <small>Leave blank for “{ANONYMOUS_SUPPORTER}”.</small>
              </label>
              <div className="form-columns">
                <label>
                  Adopted from
                  <input
                    name="startsOn"
                    type="date"
                    required
                    max={data.today}
                    defaultValue={edit.row?.startsOn ?? data.today}
                  />
                </label>
                <label>
                  Adopted through
                  <input
                    name="through"
                    type="date"
                    required
                    defaultValue={
                      edit.row
                        ? inclusiveThrough(edit.row.endsOn)
                        : addDays(data.today, DEFAULT_ADOPTION_DAYS)
                    }
                  />
                </label>
              </div>
              <p className="muted">
                Both displayed dates are included. Overlapping periods are
                rejected.
              </p>
            </>
          )}
          {edit.kind === "renew" && (
            <>
              <p>
                Renew the adoption credited to{" "}
                <strong>{edit.row.publicName ?? ANONYMOUS_SUPPORTER}</strong>.
              </p>
              <p className="muted">
                {edit.row.status === "expired"
                  ? "A new adoption period starts today if the bench is available."
                  : `The additional term begins ${formatDate(edit.row.endsOn)}, immediately after the current period.`}
              </p>
              <label>
                Additional months
                <input
                  name="months"
                  type="number"
                  min={1}
                  max={120}
                  required
                  defaultValue={12}
                />
              </label>
            </>
          )}
          {edit.kind === "cancel" && (
            <>
              <p>
                Cancel the active adoption credited to{" "}
                <strong>{edit.row.publicName ?? ANONYMOUS_SUPPORTER}</strong>?
              </p>
              <p className="muted">
                The record stays in its history. The bench becomes available
                immediately if it is in service.
              </p>
            </>
          )}
          {error && <Alert>{error}</Alert>}
          <div className="modal-actions">
            <button
              className="button"
              type="button"
              onClick={onClose}
              disabled={busy}
            >
              Close
            </button>
            <button
              className={`button ${edit.kind === "cancel" ? "destructive" : "primary"}`}
              disabled={busy}
            >
              {busy
                ? "Saving…"
                : edit.kind === "cancel"
                  ? "Cancel adoption"
                  : edit.kind === "renew"
                    ? "Confirm renewal"
                    : "Save changes"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
type Event = {
  id: string;
  action: string;
  origin: string;
  createdAt: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  actorName?: string | null;
};
function HistoryPanel({ id }: { id: string }) {
  const [records, setRecords] = useState<Event[]>();
  const [error, setError] = useState("");
  useEffect(() => {
    requestJson<Event[]>(`/api/admin/history/${id}`)
      .then(setRecords)
      .catch((error) => setError(error.message));
  }, [id]);
  return (
    <div className="modal-body">
      {error && <Alert>{error}</Alert>}
      {!records && !error && <Loading />}
      {records?.length === 0 && (
        <p className="muted">
          No recorded changes yet. Sample records begin with the seeded
          inventory.
        </p>
      )}
      {records?.map((event) => (
        <div className="history-entry" key={event.id}>
          <strong>{event.action.replaceAll("_", " ")}</strong>
          <small>
            {new Date(event.createdAt).toLocaleString()} ·{" "}
            {event.actorName ?? event.origin}
          </small>
          <dl>
            {Object.entries(event.after ?? {})
              .filter(
                ([key, value]) =>
                  ![
                    "id",
                    "benchId",
                    "donorId",
                    "createdAt",
                    "updatedAt",
                    "version",
                    "requestHash",
                    "requestId",
                    "importHash",
                  ].includes(key) &&
                  JSON.stringify(value) !== JSON.stringify(event.before?.[key]),
              )
              .map(([key, value]) => (
                <div key={key}>
                  <dt>{key.replace(/([A-Z])/g, " $1").toLowerCase()}</dt>
                  <dd>
                    {event.before?.[key] !== undefined
                      ? `${String(event.before[key] ?? "—")} → `
                      : ""}
                    {String(value ?? "—")}
                  </dd>
                </div>
              ))}
          </dl>
        </div>
      ))}
    </div>
  );
}
