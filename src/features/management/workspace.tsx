"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Plus,
  Download,
  Search,
  ArrowRight,
  Pencil,
  History,
  RefreshCw,
} from "lucide-react";
import type { StaffRecords } from "../benches/queries";
import { requestJson } from "../shared/client";
import { Badge, Alert, Loading, statusLabel } from "../shared/ui";
import { formatDate, inclusiveThrough, isExpiring } from "../adoptions/dates";
import { ANONYMOUS_SUPPORTER } from "../adoptions/validation";
import { filterRecords } from "./filter";
import { EditDialog, type Edit } from "./editor";
type Section = "overview" | "benches" | "adoptions" | "donors";
const descriptions = {
  overview: "A shared view of the park’s bench adoption program.",
  benches: "Keep the bench inventory accurate and up to date.",
  adoptions: "Manage adoption periods, public credit, and renewals.",
  donors: "Private contact records and each supporter’s adoption history.",
};
export function StaffWorkspace({ section }: { section: Section }) {
  const [data, setData] = useState<StaffRecords>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Edit>();
  const refresh = useCallback(
    () =>
      requestJson<StaffRecords>("/api/admin/records")
        .then((result) => {
          setData(result);
          setError("");
        })
        .catch((error) => setError(error.message)),
    [],
  );
  useEffect(() => {
    void refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh]);
  const done = async () => {
    setEditing(undefined);
    setNotice("Changes saved.");
    await refresh();
  };
  const changeFilter = (q: string, value: string) => {
    setSearch(q);
    setStatus(value);
    setPage(1);
  };
  const title = section[0].toUpperCase() + section.slice(1);
  const benchRows =
    data && section === "benches"
      ? filterRecords(data.benches, search, status)
      : [];
  const adoptionRows =
    data && section === "adoptions"
      ? filterRecords(data.adoptions, search, status)
      : [];
  const donorRows =
    data && section === "donors"
      ? filterRecords(data.donors, search, status)
      : [];
  const listed =
    section === "benches"
      ? benchRows
      : section === "adoptions"
        ? adoptionRows
        : donorRows;
  const expiring = data
    ? data.adoptions.filter(
        (adoption) =>
          adoption.status === "active" &&
          isExpiring(adoption.endsOn, data.today),
      )
    : [];
  const pageCount = Math.max(1, Math.ceil(listed.length / 25));
  const currentPage = Math.min(page, pageCount);
  const start = (currentPage - 1) * 25;
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">PARK OPERATIONS / {title.toUpperCase()}</p>
          <h1>{title}</h1>
          <p>{descriptions[section]}</p>
        </div>
        <div className="heading-actions">
          <button
            className="icon-button"
            aria-label="Refresh records"
            onClick={() => void refresh()}
          >
            <RefreshCw size={17} />
          </button>
          {(section === "benches" || section === "adoptions") && (
            <button
              className="button primary"
              onClick={() =>
                setEditing({
                  kind: section === "benches" ? "bench" : "adoption",
                })
              }
            >
              <Plus size={17} /> Add{" "}
              {section === "benches" ? "bench" : "adoption"}
            </button>
          )}
        </div>
      </div>
      {error && <Alert>{error}</Alert>}
      {notice && <Alert success>{notice}</Alert>}
      {!data ? (
        !error && <Loading />
      ) : section === "overview" ? (
        <>
          <div className="stats-grid">
            {[
              ["Inventory", data.counts.inventory, "Non-retired benches"],
              ["Available", data.counts.available, "Ready for adoption"],
              ["Active adoptions", data.counts.active, "Current supporters"],
              ["Expiring soon", expiring.length, "Within the next 30 days"],
            ].map(([label, count, note]) => (
              <div className="stat" key={label}>
                <span>{label}</span>
                <strong>{count}</strong>
                <small>{note}</small>
              </div>
            ))}
          </div>
          <div className="dashboard-grid">
            <section className="card">
              <div className="card-heading">
                <div>
                  <p className="eyebrow">UPCOMING</p>
                  <h2>Adoptions ending soon</h2>
                </div>
                <Link href="/staff/adoptions" className="text-button">
                  View all <ArrowRight size={14} />
                </Link>
              </div>
              {expiring.slice(0, 8).map((adoption) => (
                <div className="upcoming-row" key={adoption.id}>
                  <div>
                    <strong>{adoption.benchCode}</strong>
                    <small>{adoption.publicName ?? ANONYMOUS_SUPPORTER}</small>
                  </div>
                  <span>{formatDate(inclusiveThrough(adoption.endsOn))}</span>
                  <button
                    className="button small"
                    onClick={() => setEditing({ kind: "renew", row: adoption })}
                  >
                    Renew
                  </button>
                </div>
              ))}
              {expiring.length === 0 && (
                <p className="empty-state">
                  No adoptions expire in the next thirty days.
                </p>
              )}
            </section>
            <section className="card">
              <div className="card-heading">
                <div>
                  <p className="eyebrow">INVENTORY</p>
                  <h2>Benches by park area</h2>
                </div>
              </div>
              {Object.entries(
                data.benches
                  .filter((b) => b.state !== "retired")
                  .reduce<Record<string, number>>(
                    (all, b) => ({ ...all, [b.area]: (all[b.area] ?? 0) + 1 }),
                    {},
                  ),
              )
                .sort((a, b) => b[1] - a[1])
                .slice(0, 8)
                .map(([area, count]) => (
                  <div className="area-row" key={area}>
                    <div>
                      <span>{area}</span>
                      <strong>{count}</strong>
                    </div>
                    <div className="bar-track">
                      <span
                        style={{
                          width: `${(count / data.counts.inventory) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              <Link href="/staff/benches" className="button full">
                Open inventory <ArrowRight size={15} />
              </Link>
            </section>
          </div>
        </>
      ) : (
        <section className="card table-card">
          <div className="table-toolbar">
            <div className="search-field">
              <Search size={17} />
              <input
                aria-label={`Search ${section}`}
                value={search}
                onChange={(e) => changeFilter(e.target.value, status)}
                placeholder={`Search ${section}…`}
              />
            </div>
            {section !== "donors" && (
              <select
                aria-label="Filter records by status"
                value={status}
                onChange={(e) => changeFilter(search, e.target.value)}
              >
                <option value="all">All statuses</option>
                {(section === "benches"
                  ? (["in_service", "unavailable", "retired"] as const)
                  : (["active", "expired", "cancelled"] as const)
                ).map((value) => (
                  <option key={value} value={value}>
                    {statusLabel(value)}
                  </option>
                ))}
              </select>
            )}
            <a
              className="button"
              href={`/api/admin/exports/${section}?q=${encodeURIComponent(search)}&status=${status}`}
            >
              <Download size={15} /> Export CSV
            </a>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {(section === "benches"
                    ? ["Bench", "Location", "State", "Adoption", "Actions"]
                    : section === "adoptions"
                      ? [
                          "Bench / supporter",
                          "Period",
                          "Status",
                          "Contact",
                          "Actions",
                        ]
                      : ["Contact name", "Email", "Adoptions", "Actions"]
                  ).map((label) => (
                    <th key={label}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {section === "benches" &&
                  benchRows.slice(start, start + 25).map((b) => (
                    <tr key={b.id}>
                      <td>
                        <strong>{b.code}</strong>
                        <small>
                          {b.source === "sample"
                            ? "Sample inventory"
                            : b.source}
                        </small>
                      </td>
                      <td>
                        {b.area}
                        <small>{b.description}</small>
                      </td>
                      <td>
                        <Badge status={b.state} />
                      </td>
                      <td>
                        {b.adopted ? (
                          <Badge status="adopted" />
                        ) : (
                          <span className="muted">No active adoption</span>
                        )}
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            className="button small"
                            onClick={() =>
                              setEditing({ kind: "bench", row: b })
                            }
                          >
                            <Pencil size={13} /> Edit
                          </button>
                          <button
                            className="icon-button"
                            aria-label={`History for ${b.code}`}
                            onClick={() =>
                              setEditing({ kind: "history", row: b })
                            }
                          >
                            <History size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                {section === "adoptions" &&
                  adoptionRows.slice(start, start + 25).map((a) => (
                    <tr key={a.id}>
                      <td>
                        <strong>{a.benchCode}</strong>
                        <small>{a.publicName ?? ANONYMOUS_SUPPORTER}</small>
                      </td>
                      <td className="nowrap">
                        {formatDate(a.startsOn)}
                        <small>
                          through {formatDate(inclusiveThrough(a.endsOn))}
                        </small>
                      </td>
                      <td>
                        <Badge status={a.status} />
                      </td>
                      <td>
                        {a.donorName}
                        <small>{a.donorEmail}</small>
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            className="button small"
                            onClick={() =>
                              setEditing({ kind: "adoption", row: a })
                            }
                          >
                            Edit
                          </button>
                          {a.status !== "cancelled" && (
                            <button
                              className="button small"
                              onClick={() =>
                                setEditing({ kind: "renew", row: a })
                              }
                            >
                              Renew
                            </button>
                          )}
                          {a.status === "active" && (
                            <button
                              className="text-button danger"
                              onClick={() =>
                                setEditing({ kind: "cancel", row: a })
                              }
                            >
                              Cancel
                            </button>
                          )}
                          <button
                            className="icon-button"
                            aria-label={`History for adoption on ${a.benchCode}`}
                            onClick={() =>
                              setEditing({ kind: "history", row: a })
                            }
                          >
                            <History size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                {section === "donors" &&
                  donorRows.slice(start, start + 25).map((d) => (
                    <tr key={d.id}>
                      <td>
                        <strong>{d.name}</strong>
                      </td>
                      <td>{d.email}</td>
                      <td>
                        <button
                          className="text-button"
                          onClick={() =>
                            setEditing({ kind: "donorHistory", row: d })
                          }
                        >
                          {d.adoptionCount}{" "}
                          {d.adoptionCount === 1 ? "adoption" : "adoptions"}
                          <ArrowRight size={13} />
                        </button>
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            className="button small"
                            onClick={() =>
                              setEditing({ kind: "donor", row: d })
                            }
                          >
                            Edit contact
                          </button>
                          <button
                            className="icon-button"
                            aria-label={`History for ${d.name}`}
                            onClick={() =>
                              setEditing({ kind: "history", row: d })
                            }
                          >
                            <History size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {listed.length === 0 && (
              <div className="empty-state">
                <h3>No matching records</h3>
                <p>Try a different search or status.</p>
              </div>
            )}
          </div>
          <div className="pagination">
            <span>
              {listed.length} records · Page {currentPage} of {pageCount}
            </span>
            <div>
              <button
                disabled={currentPage === 1}
                onClick={() => setPage(currentPage - 1)}
              >
                Previous
              </button>
              <button
                disabled={currentPage === pageCount}
                onClick={() => setPage(currentPage + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </section>
      )}
      {editing && data && (
        <EditDialog
          edit={editing}
          data={data}
          onClose={() => setEditing(undefined)}
          onSaved={done}
        />
      )}
    </>
  );
}
