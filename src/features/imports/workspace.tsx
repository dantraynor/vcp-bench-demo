"use client";
import { useState } from "react";
import {
  Upload,
  FileSpreadsheet,
  Download,
  Check,
  ArrowRight,
} from "lucide-react";
import { requestJson } from "../shared/client";
import { Alert } from "../shared/ui";
import type { ImportKind, ImportReport } from "./service";
export function ImportWorkspace() {
  const [kind, setKind] = useState<ImportKind>("benches");
  const [file, setFile] = useState<File>();
  const [report, setReport] = useState<ImportReport>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function run(commit = false) {
    if (!file) {
      setError("Choose a CSV file first.");
      return;
    }
    setBusy(true);
    setError("");
    const form = new FormData();
    form.set("file", file);
    form.set("kind", kind);
    if (commit && report) form.set("fingerprint", report.fingerprint);
    try {
      setReport(
        await requestJson<ImportReport>(
          `/api/admin/imports/${commit ? "commit" : "preview"}`,
          { method: "POST", body: form },
        ),
      );
    } catch (error) {
      setError((error as Error).message);
      if (commit) setReport(undefined);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">PARK OPERATIONS / IMPORTS</p>
          <h1>Import records</h1>
          <p>Bring existing inventory and adoption records into one place.</p>
        </div>
      </div>
      <div className="import-layout">
        <section className="card import-card">
          <div className="step-heading">
            <span>1</span>
            <div>
              <h2>Prepare your file</h2>
              <p>Use the template so every column is recognized.</p>
            </div>
          </div>
          <div className="import-kind">
            <button
              disabled={busy}
              onClick={() => {
                setKind("benches");
                setReport(undefined);
              }}
              className={kind === "benches" ? "active" : ""}
            >
              <FileSpreadsheet size={20} />
              <strong>Bench inventory</strong>
              <small>Add benches or update their location and state.</small>
            </button>
            <button
              disabled={busy}
              onClick={() => {
                setKind("adoptions");
                setReport(undefined);
              }}
              className={kind === "adoptions" ? "active" : ""}
            >
              <FileSpreadsheet size={20} />
              <strong>Adoption records</strong>
              <small>Import current and historical adoption periods.</small>
            </button>
          </div>
          <a href={`/api/admin/templates/${kind}`} className="button">
            <Download size={16} /> Download {kind} template
          </a>
          <div className="step-heading">
            <span>2</span>
            <div>
              <h2>Upload and preview</h2>
              <p>CSV only · Up to 2 MB and 2,000 rows</p>
            </div>
          </div>
          <label className="file-drop">
            <Upload size={24} />
            <strong>{file?.name ?? "Choose a CSV file"}</strong>
            <small>
              Your preview will show changes before anything is saved.
            </small>
            <input
              aria-label="CSV file"
              type="file"
              accept=".csv,text/csv"
              disabled={busy}
              onChange={(e) => {
                setFile(e.target.files?.[0]);
                setReport(undefined);
                setError("");
              }}
            />
          </label>
          {error && <Alert>{error}</Alert>}
          <button
            className="button primary"
            disabled={!file || busy}
            onClick={() => void run()}
          >
            {busy ? "Checking records…" : "Preview import"}
            <ArrowRight size={16} />
          </button>
        </section>
        <aside className="card import-help">
          <p className="eyebrow">HOW IT WORKS</p>
          <h2>A careful import.</h2>
          <ul>
            <li>Import benches before their adoption records.</li>
            <li>
              Existing bench codes update the same bench; history stays intact.
            </li>
            <li>
              Adoptions need a unique external ID. Identical repeats are
              skipped.
            </li>
            <li>“Adopted through” includes that entire calendar day.</li>
            <li>Future reservations and overlapping adoptions are rejected.</li>
            <li>Any invalid row prevents the whole file from being saved.</li>
          </ul>
          <p className="muted">
            Existing donor contact details are preserved. Use the donor
            workspace to correct them.
          </p>
        </aside>
      </div>
      {report && (
        <section className="card import-results">
          <div className="card-heading">
            <div>
              <p className="eyebrow">
                {report.committed ? "COMPLETE" : "REVIEW CHANGES"}
              </p>
              <h2>{report.committed ? "Import saved" : "Import preview"}</h2>
            </div>
            {report.committed && (
              <span className="badge badge-active">
                <Check size={14} /> Saved
              </span>
            )}
          </div>
          <div className="import-counts">
            {[
              ["Rows", report.total],
              ["New", report.created],
              ["Updated", report.updated],
              ["Unchanged", report.unchanged],
              ["Errors", report.errors.length],
            ].map(([label, number]) => (
              <div key={label}>
                <strong>{number}</strong>
                <span>{label}</span>
              </div>
            ))}
          </div>
          {report.errors.length > 0 && (
            <Alert>
              Fix the row errors and upload the corrected CSV. No records have
              been changed.
            </Alert>
          )}
          {report.warnings.length > 0 && (
            <div className="alert alert-warning">
              Review the location warnings before confirming this import.
            </div>
          )}
          {(report.errors.length > 0 || report.warnings.length > 0) && (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>CSV row</th>
                    <th>Result</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {report.errors.map((item, i) => (
                    <tr key={`error-${i}`}>
                      <td>{item.row}</td>
                      <td>Error</td>
                      <td>{item.message}</td>
                    </tr>
                  ))}
                  {report.warnings.map((item, i) => (
                    <tr key={`warning-${i}`}>
                      <td>{item.row}</td>
                      <td>Warning</td>
                      <td>{item.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {report.changes?.length > 0 && (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>CSV row</th>
                    <th>Record</th>
                    <th>Action</th>
                    <th>Changes</th>
                  </tr>
                </thead>
                <tbody>
                  {report.changes.map((change) => (
                    <tr key={change.row}>
                      <td>{change.row}</td>
                      <td>{change.identifier}</td>
                      <td>{change.action}</td>
                      <td>{change.details}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!report.committed && !report.errors.length && (
            <div className="import-confirm">
              <p>
                {report.warnings.length
                  ? "I have reviewed the changes and location warnings."
                  : "The file is valid. Confirm to save these changes together."}
              </p>
              <button
                className="button primary"
                disabled={busy}
                onClick={() => void run(true)}
              >
                {busy ? "Importing…" : "Confirm import"}
                <Check size={16} />
              </button>
            </div>
          )}
          {report.committed && (
            <p className="muted">
              All changes were saved together and recorded in the record
              history.
            </p>
          )}
        </section>
      )}
    </>
  );
}
