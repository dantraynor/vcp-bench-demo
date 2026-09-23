"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  ArrowLeft,
  MapPin,
  CalendarDays,
  ShieldCheck,
  Check,
  ArrowUpRight,
  Armchair,
} from "lucide-react";
import type { PublicBench } from "./queries";
import { requestJson, jsonRequest } from "../shared/client";
import { Badge, Alert, Loading } from "../shared/ui";
import {
  addMonths,
  formatDate,
  inclusiveThrough,
  parkToday,
} from "../adoptions/dates";
import { ANONYMOUS_SUPPORTER } from "../adoptions/validation";
const BenchMap = dynamic(() => import("./map"), {
  ssr: false,
  loading: () => <Loading label="Loading map…" />,
});
type Receipt = {
  id: string;
  publicName: string | null;
  startsOn: string;
  endsOn: string;
};
export function BenchDetail({ code }: { code: string }) {
  const [bench, setBench] = useState<PublicBench | null>(null);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<Receipt>();
  const [anonymous, setAnonymous] = useState(false);
  const [amount, setAmount] = useState(1);
  const [unit, setUnit] = useState("years");
  const request = useRef<{ id: string; payload: string } | null>(null);
  const refresh = useCallback(
    () =>
      requestJson<PublicBench>(`/api/benches/${encodeURIComponent(code)}`)
        .then((result) => {
          setBench(result);
          setLoadError("");
        })
        .catch((error) => setLoadError(error.message)),
    [code],
  );
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const months = amount * (unit === "years" ? 12 : 1);
  const today = parkToday();
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const input = {
      benchCode: code,
      name: form.get("name"),
      email: form.get("email"),
      publicName: anonymous ? null : form.get("publicName"),
      months,
    };
    const payload = JSON.stringify(input);
    if (!request.current || request.current.payload !== payload)
      request.current = { id: crypto.randomUUID(), payload };
    try {
      setReceipt(
        await requestJson<Receipt>(
          "/api/adoptions",
          jsonRequest("POST", { ...input, requestId: request.current.id }),
        ),
      );
      await refresh();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Link href="/" className="back-link">
        <ArrowLeft size={15} /> All benches
      </Link>
      {loadError && (
        <Alert>
          {loadError}{" "}
          <button className="text-button" onClick={() => void refresh()}>
            Retry
          </button>
        </Alert>
      )}
      {!bench ? (
        !loadError && <Loading />
      ) : (
        <>
          <div className="page-heading">
            <div>
              <p className="eyebrow">BENCH DETAILS</p>
              <h1>
                {bench.code}
                <Badge status={bench.availability} />
              </h1>
              <p className="location-line">
                <MapPin size={17} />
                {bench.area}
              </p>
            </div>
            <span className="subtle-label">
              {bench.source === "sample"
                ? "ILLUSTRATIVE INVENTORY"
                : "STAFF INVENTORY"}
            </span>
          </div>
          <div className="detail-layout">
            <div>
              <div className="detail-map">
                <BenchMap benches={[bench]} selected={bench.code} />
              </div>
              <section className="card location-card">
                <Armchair size={22} />
                <div>
                  <h3>About this bench</h3>
                  <p>{bench.description}</p>
                  <small>
                    Coordinates: {bench.latitude.toFixed(5)},{" "}
                    {bench.longitude.toFixed(5)}
                    {bench.source === "sample" ? " · Sample location" : ""}
                  </small>
                </div>
              </section>
            </div>
            <section className="card adoption-card">
              {receipt ? (
                <div className="confirmation">
                  <span className="confirmation-icon">
                    <Check size={27} />
                  </span>
                  <p className="eyebrow">ADOPTION CONFIRMED</p>
                  <h2>Thank you for supporting the park.</h2>
                  <p>
                    <strong>{code}</strong> is now adopted by{" "}
                    {receipt.publicName ?? "an anonymous supporter"}.
                  </p>
                  <div className="date-summary">
                    <CalendarDays size={20} />
                    <div>
                      <strong>
                        {formatDate(receipt.startsOn)} —{" "}
                        {formatDate(inclusiveThrough(receipt.endsOn))}
                      </strong>
                      <small>
                        Available again {formatDate(receipt.endsOn)}
                      </small>
                    </div>
                  </div>
                  <p className="muted">
                    Your adoption has been saved. No payment is required for
                    this demonstration.
                  </p>
                  <Link href="/" className="button primary full">
                    Back to the registry <ArrowUpRight size={16} />
                  </Link>
                </div>
              ) : bench.availability === "available" ? (
                <>
                  <p className="eyebrow">MAKE IT YOURS</p>
                  <h2>Adopt this bench</h2>
                  <p className="muted">
                    Choose a term and the name you’d like the community to see.
                  </p>
                  <form onSubmit={submit} className="form-stack">
                    <label>
                      Contact name
                      <input
                        name="name"
                        required
                        minLength={2}
                        maxLength={100}
                        autoComplete="name"
                        placeholder="Your full name"
                      />
                      <small>Visible to park staff only.</small>
                    </label>
                    <label>
                      Email address
                      <input
                        name="email"
                        type="email"
                        required
                        maxLength={254}
                        autoComplete="email"
                        placeholder="you@example.com"
                      />
                      <small>
                        Private contact information. No account needed.
                      </small>
                    </label>
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={anonymous}
                        onChange={(e) => setAnonymous(e.target.checked)}
                      />{" "}
                      Show me as an anonymous supporter
                    </label>
                    {!anonymous && (
                      <label>
                        Public display name
                        <input
                          name="publicName"
                          required
                          maxLength={100}
                          placeholder="e.g. The Rivera Family"
                        />
                        <small>
                          This name appears publicly beside the bench.
                        </small>
                      </label>
                    )}
                    <div>
                      <label htmlFor="duration">Adoption term</label>
                      <div className="duration-fields">
                        <input
                          id="duration"
                          aria-label="Duration"
                          type="number"
                          min={1}
                          max={unit === "years" ? 10 : 120}
                          step={1}
                          required
                          value={amount}
                          onChange={(e) => setAmount(Number(e.target.value))}
                        />
                        <select
                          aria-label="Duration unit"
                          value={unit}
                          onChange={(e) => {
                            setUnit(e.target.value);
                            setAmount(1);
                          }}
                        >
                          <option value="years">Years</option>
                          <option value="months">Months</option>
                        </select>
                      </div>
                    </div>
                    {months > 0 &&
                      months <= 120 &&
                      Number.isInteger(months) && (
                        <div className="date-summary">
                          <CalendarDays size={18} />
                          <div>
                            <strong>
                              {formatDate(today)} —{" "}
                              {formatDate(
                                inclusiveThrough(addMonths(today, months)),
                              )}
                            </strong>
                            <small>
                              Starts today · {months}{" "}
                              {months === 1 ? "month" : "months"}
                            </small>
                          </div>
                        </div>
                      )}
                    {error && <Alert>{error}</Alert>}
                    <button className="button primary full" disabled={busy}>
                      {busy ? "Saving adoption…" : "Confirm adoption"}
                      <ArrowUpRight size={16} />
                    </button>
                    <p className="form-note">
                      <ShieldCheck size={15} /> No payment. Your contact details
                      stay private.
                    </p>
                  </form>
                </>
              ) : (
                <>
                  <p className="eyebrow">CURRENT STATUS</p>
                  <h2>
                    {bench.adoption
                      ? "A bench with a supporter."
                      : "Temporarily unavailable"}
                  </h2>
                  {bench.adoption ? (
                    <>
                      <div className="supporter-name">
                        {bench.adoption.publicName ?? ANONYMOUS_SUPPORTER}
                      </div>
                      <div className="date-summary">
                        <CalendarDays size={20} />
                        <div>
                          <strong>
                            {formatDate(bench.adoption.startsOn)} —{" "}
                            {formatDate(
                              inclusiveThrough(bench.adoption.endsOn),
                            )}
                          </strong>
                          <small>
                            Adoption ends {formatDate(bench.adoption.endsOn)}
                          </small>
                        </div>
                      </div>
                    </>
                  ) : (
                    <p className="muted">
                      This bench is out of service and cannot be adopted right
                      now.
                    </p>
                  )}
                  {bench.state === "unavailable" && bench.adoption && (
                    <p className="muted">
                      This bench is also temporarily out of service. Its
                      adoption remains on record.
                    </p>
                  )}
                  <Link className="button full" href="/?status=available">
                    Find an available bench <ArrowUpRight size={16} />
                  </Link>
                </>
              )}
            </section>
          </div>
        </>
      )}
    </>
  );
}
