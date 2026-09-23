import { describe, expect, it } from "vitest";
import {
  addMonths,
  adoptionStatus,
  exclusiveEnd,
  inclusiveThrough,
  isDate,
  parkToday,
} from "@/features/adoptions/dates";
import {
  guestAdoptionSchema,
  benchInputSchema,
} from "@/features/adoptions/validation";
import { validatePeriod } from "@/features/adoptions/service";
import { csvExport } from "@/features/imports/service";
import { parse } from "csv-parse/sync";
import { testDatabaseUrl } from "../database";

describe("calendar rules", () => {
  it.each([
    ["2025-01-31", 1, "2025-02-28"],
    ["2024-01-31", 1, "2024-02-29"],
    ["2024-02-29", 12, "2025-02-28"],
    ["2026-12-31", 2, "2027-02-28"],
  ])(
    "adds calendar months with month-end clamping (%s)",
    (start, months, expected) => {
      expect(addMonths(start, months)).toBe(expected);
    },
  );
  it.each([
    ["2026-09-22T03:59:59Z", "2026-09-21"],
    ["2026-09-22T04:00:00Z", "2026-09-22"],
    ["2026-03-08T06:59:59Z", "2026-03-08"],
    ["2026-03-08T07:00:00Z", "2026-03-08"],
  ])(
    "uses the park's date regardless of server timezone (%s)",
    (instant, day) => {
      expect(parkToday(new Date(instant))).toBe(day);
    },
  );
  it("expires precisely at the exclusive end and displays the previous day", () => {
    const adoption = {
      startsOn: "2026-01-01",
      endsOn: "2026-02-01",
      cancelledOn: null,
    };
    expect(adoptionStatus(adoption, "2026-01-31")).toBe("active");
    expect(adoptionStatus(adoption, "2026-02-01")).toBe("expired");
    expect(inclusiveThrough(adoption.endsOn)).toBe("2026-01-31");
    expect(exclusiveEnd("2026-01-31")).toBe(adoption.endsOn);
  });
  it.each([
    "2026-02-29",
    "2026-2-01",
    "not-a-date",
    "2026-13-01",
    "2026-01-01T00:00Z",
    "0000-01-01",
  ])("rejects invalid dates (%s)", (value) =>
    expect(isDate(value)).toBe(false),
  );
  it("rejects reservations, inverted periods, and future cancellations", () => {
    expect(() =>
      validatePeriod("2026-09-23", "2026-10-23", "2026-09-22"),
    ).toThrow("Future reservations");
    expect(() =>
      validatePeriod("2026-09-22", "2026-09-22", "2026-09-22"),
    ).toThrow("last adopted day");
    expect(() =>
      validatePeriod("2026-09-20", "2026-10-20", "2026-09-22", "2026-09-23"),
    ).toThrow("Cancellation");
  });
});

describe("input and export boundaries", () => {
  const guest = {
    benchCode: "VCP-001",
    name: " Jane Donor ",
    email: " JANE@EXAMPLE.COM ",
    publicName: " ",
    months: 12,
    requestId: "f361c986-c5d0-4ee7-9ba0-34ff6e25cf83",
  };
  it("normalizes private contacts and explicit anonymous credit", () => {
    expect(guestAdoptionSchema.parse(guest)).toMatchObject({
      name: "Jane Donor",
      email: "jane@example.com",
      publicName: null,
    });
  });
  it.each([0, -1, 1.5, 121, NaN])(
    "rejects unsupported durations (%s)",
    (months) =>
      expect(guestAdoptionSchema.safeParse({ ...guest, months }).success).toBe(
        false,
      ),
  );
  it("rejects client-supplied dates and invalid coordinates", () => {
    expect(
      guestAdoptionSchema.safeParse({ ...guest, startsOn: "2020-01-01" })
        .success,
    ).toBe(false);
    expect(
      benchInputSchema.safeParse({
        code: "AB",
        description: "Test bench",
        state: "in_service",
        latitude: Infinity,
        longitude: 0,
      }).success,
    ).toBe(false);
  });
  it("escapes spreadsheet formulas while preserving commas and quotes", () => {
    const exported = csvExport([
      { name: '=HYPERLINK("https://example.com")', notes: 'Park, "south"' },
    ]);
    expect(parse(exported, { columns: true })[0]).toEqual({
      name: '\'=HYPERLINK("https://example.com")',
      notes: 'Park, "south"',
    });
  });
  it.each([
    "postgresql://postgres@localhost:54329/bench_adoption",
    "postgresql://postgres@host.example/bench_adoption_test",
  ])("refuses destructive test setup on other databases", (url) =>
    expect(() => testDatabaseUrl(url)).toThrow(
      "Tests require a local database",
    ),
  );
});
