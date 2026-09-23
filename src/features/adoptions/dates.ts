import { Temporal } from "@js-temporal/polyfill";
export const PARK_TIMEZONE = "America/New_York";
export const DEFAULT_ADOPTION_DAYS = 364;
export function parkToday(now: Date = new Date()): string {
  return Temporal.Instant.from(now.toISOString())
    .toZonedDateTimeISO(PARK_TIMEZONE)
    .toPlainDate()
    .toString();
}
export function addMonths(day: string, months: number): string {
  return Temporal.PlainDate.from(day)
    .add({ months }, { overflow: "constrain" })
    .toString();
}
export function addDays(day: string, days: number): string {
  return Temporal.PlainDate.from(day).add({ days }).toString();
}
export function exclusiveEnd(through: string): string {
  return addDays(through, 1);
}
export function inclusiveThrough(endsOn: string): string {
  return addDays(endsOn, -1);
}
export function isExpiring(endsOn: string, today: string): boolean {
  return endsOn <= addDays(today, 30);
}
export function isDate(value: string): boolean {
  try {
    return (
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      value >= "0001-01-01" &&
      Temporal.PlainDate.from(value).toString() === value
    );
  } catch {
    return false;
  }
}
export function adoptionStatus(
  adoption: { startsOn: string; endsOn: string; cancelledOn: string | null },
  today = parkToday(),
) {
  if (adoption.cancelledOn) return "cancelled" as const;
  if (adoption.endsOn <= today) return "expired" as const;
  return "active" as const;
}
export function formatDate(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
