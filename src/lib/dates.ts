// Date-only values (hire date, birthdays, rate periods) travel as "YYYY-MM-DD" strings and are stored
// as UTC midnight in @db.Date columns. Never convert them through local time.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function parseIsoDate(value: string): Date {
  if (!isIsoDate(value)) throw new Error(`Invalid date: ${value}`);
  return new Date(`${value}T00:00:00Z`);
}

export function toIsoDate(value: Date | null | undefined): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

/** "MM-DD" — birthday without the year. */
export function toMonthDay(value: Date | null | undefined): string | null {
  return value ? value.toISOString().slice(5, 10) : null;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/** Adds calendar months; a Feb 29 start lands on Feb 28 in non-leap years (end-of-month clamp). */
export function addMonths(date: Date, months: number): Date {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + months;
  const day = date.getUTCDate();
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(day, lastDay)));
}
