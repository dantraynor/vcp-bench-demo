"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Search,
  List,
  Map,
  ArrowUpRight,
  MapPin,
  X,
  SlidersHorizontal,
  RefreshCw,
} from "lucide-react";
import type { PublicBench } from "./queries";
import { requestJson } from "../shared/client";
import { Badge, Alert, Loading } from "../shared/ui";
import { formatDate, inclusiveThrough } from "../adoptions/dates";
import { ANONYMOUS_SUPPORTER } from "../adoptions/validation";
const BenchMap = dynamic(() => import("./map"), {
  ssr: false,
  loading: () => <Loading label="Loading map…" />,
});

export function BenchExplorer() {
  const [records, setRecords] = useState<PublicBench[] | null>(null);
  const params = useSearchParams();
  const search = params.get("q") ?? "";
  const status = params.get("status") ?? "all";
  const area = params.get("area") ?? "all";
  const selected = params.get("bench") ?? undefined;
  const [error, setError] = useState("");
  const [view, setView] = useState("list");
  const [page, setPage] = useState(1);
  const refresh = useCallback(
    () =>
      requestJson<{ benches: PublicBench[] }>("/api/benches")
        .then((result) => {
          setRecords(result.benches);
          setError("");
        })
        .catch((error) => setError(error.message)),
    [],
  );
  useEffect(() => {
    void refresh();
    const focus = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const timer = setInterval(focus, 60_000);
    window.addEventListener("focus", focus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
  }, [refresh]);
  const matches = useMemo(
    () =>
      (records ?? []).filter(
        (b) =>
          (status === "all" || b.availability === status) &&
          (area === "all" || b.area === area) &&
          [b.code, b.description, b.area, b.adoption?.publicName ?? ""].some(
            (text) => text.toLowerCase().includes(search.toLowerCase().trim()),
          ),
      ),
    [records, status, area, search],
  );
  const pageCount = Math.max(1, Math.ceil(matches.length / 20));
  const currentPage = Math.min(page, pageCount);
  const active = records?.find((b) => b.code === selected);
  const update = (q: string, nextStatus: string, nextArea: string) => {
    setPage(1);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (nextStatus !== "all") params.set("status", nextStatus);
    if (nextArea !== "all") params.set("area", nextArea);
    window.history.replaceState(null, "", `/?${params}`);
  };
  const choose = (code?: string) => {
    const params = new URLSearchParams(window.location.search);
    if (code) params.set("bench", code);
    else params.delete("bench");
    window.history.replaceState(null, "", `/?${params}`);
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">THE PARK, ONE BENCH AT A TIME</p>
          <h1>
            Bench registry
            <span className="title-count">{records?.length ?? "—"}</span>
          </h1>
          <p>
            Explore the park’s benches, see who supports them, and adopt your
            own.
          </p>
        </div>
        <div className="heading-note">
          <span className="live-dot" /> Shared availability{" "}
          <button
            className="icon-button"
            aria-label="Refresh availability"
            onClick={() => void refresh()}
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </div>
      <div className="stats-grid public-stats">
        {[
          ["Total benches", records?.length, "Across Van Cortlandt Park"],
          [
            "Available to adopt",
            records?.filter((b) => b.availability === "available").length,
            "Find a bench to support",
          ],
          [
            "Currently adopted",
            records?.filter((b) => b.availability === "adopted").length,
            "Supported by the community",
          ],
          [
            "Unavailable",
            records?.filter((b) => b.availability === "unavailable").length,
            "Temporarily out of service",
          ],
        ].map(([label, count, hint]) => (
          <div className="stat" key={label as string}>
            <span>{label}</span>
            <strong>{count ?? "—"}</strong>
            <small>{hint}</small>
          </div>
        ))}
      </div>
      {error && (
        <Alert>
          {records ? "Availability may be out of date. " : ""}
          {error}{" "}
          <button onClick={() => void refresh()} className="text-button">
            Retry
          </button>
        </Alert>
      )}
      {!records && !error ? (
        <Loading />
      ) : (
        <section className="explorer">
          <div className="inventory-toolbar">
            <div className="search-field">
              <Search size={17} />
              <input
                aria-label="Search benches"
                placeholder="Search bench, area, or adopter…"
                value={search}
                onChange={(e) => update(e.target.value, status, area)}
              />
            </div>
            <div className="filters">
              <SlidersHorizontal size={16} />
              <select
                aria-label="Filter by availability"
                value={status}
                onChange={(e) => update(search, e.target.value, area)}
              >
                <option value="all">All statuses</option>
                <option value="available">Available</option>
                <option value="adopted">Adopted</option>
                <option value="unavailable">Unavailable</option>
              </select>
              <select
                aria-label="Filter by park area"
                value={area}
                onChange={(e) => update(search, status, e.target.value)}
              >
                <option value="all">All park areas</option>
                {[...new Set(records?.map((b) => b.area))]
                  .sort()
                  .map((name) => (
                    <option key={name}>{name}</option>
                  ))}
              </select>
            </div>
            <div className="view-toggle" aria-label="Mobile view">
              <button
                className={view === "list" ? "selected" : ""}
                onClick={() => setView("list")}
                aria-label="List view"
              >
                <List size={18} />
              </button>
              <button
                className={view === "map" ? "selected" : ""}
                onClick={() => setView("map")}
                aria-label="Map view"
              >
                <Map size={18} />
              </button>
            </div>
          </div>
          <div className={`explorer-body mobile-${view}`}>
            <div className="bench-list">
              <div className="list-caption">
                <span>{matches.length} benches</span>
                <span>LOCATION / STATUS</span>
              </div>
              <div className="bench-rows">
                {matches
                  .slice((currentPage - 1) * 20, currentPage * 20)
                  .map((bench) => (
                    <button
                      key={bench.id}
                      className={`bench-row ${selected === bench.code ? "is-selected" : ""}`}
                      onClick={() => choose(bench.code)}
                      aria-label={`${bench.code}, ${bench.area}, ${bench.availability}`}
                    >
                      <span className="bench-row-heading">
                        <strong>{bench.code}</strong>
                        <Badge status={bench.availability} />
                      </span>
                      <span className="bench-row-location">
                        <MapPin size={13} />
                        {bench.area}
                      </span>
                      <span className="bench-row-meta">
                        {bench.adoption
                          ? `${bench.adoption.publicName ?? ANONYMOUS_SUPPORTER} · through ${formatDate(inclusiveThrough(bench.adoption.endsOn))}`
                          : bench.description}
                      </span>
                    </button>
                  ))}
                {matches.length === 0 && (
                  <div className="empty-state">
                    <h3>No benches match</h3>
                    <p>Try another search or clear your filters.</p>
                    <button
                      className="button"
                      onClick={() => update("", "all", "all")}
                    >
                      Clear filters
                    </button>
                  </div>
                )}
              </div>
              <div className="pagination">
                <span>
                  {matches.length
                    ? `${(currentPage - 1) * 20 + 1}–${Math.min(currentPage * 20, matches.length)} of ${matches.length}`
                    : "0 results"}
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
            </div>
            <div className="map-section">
              <BenchMap
                benches={matches}
                selected={selected}
                onSelect={choose}
              />
            </div>
          </div>
          {active && (
            <div className="selection-bar">
              <div>
                <strong>{active.code}</strong>
                <span>{active.area}</span>
                <Badge status={active.availability} />
              </div>
              <div>
                <Link
                  className="button primary"
                  href={`/benches/${active.code}`}
                >
                  {active.availability === "available"
                    ? "View & adopt"
                    : "View details"}
                  <ArrowUpRight size={16} />
                </Link>
                <button
                  className="icon-button"
                  onClick={() => choose(undefined)}
                  aria-label="Clear selected bench"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
          )}
        </section>
      )}
      <p className="inventory-footnote">
        <MapPin size={14} /> Map geometry: NYC Parks. Bench pins and adoption
        records are sample data.
      </p>
    </>
  );
}
