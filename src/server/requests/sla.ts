/**
 * SLA in working days, counted in the assignee's time zone (PRD 4, 7).
 * Phase 1: Mon–Fri, no holidays. Phase 2 passes an isWorkingDay() built from WorkWeek and non-working calendar layers.
 */

export type WorkingDayFn = (isoDate: string) => boolean;

export const mondayToFriday: WorkingDayFn = (isoDate) => {
  const dow = new Date(`${isoDate}T00:00:00Z`).getUTCDay();
  return dow !== 0 && dow !== 6;
};

/** Calendar date ("YYYY-MM-DD") of an instant in a time zone. */
export function localDate(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
}

/** Offset of `timeZone` from UTC at `instant`, in ms (positive east of UTC). */
function tzOffset(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The UTC instant of local wall-clock time `isoDate hh:mm:ss` in `timeZone` (DST-safe). */
export function zonedTimeToUtc(isoDate: string, time: string, timeZone: string): Date {
  const [y, m, d] = isoDate.split("-").map(Number);
  const [hh, mm, ss] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm, ss);
  let result = guess - tzOffset(new Date(guess), timeZone);
  // re-evaluate once in case the guess crossed a DST transition
  result = guess - tzOffset(new Date(result), timeZone);
  return new Date(result);
}

function nextDate(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Due moment for a step activated at `start` with `slaDays` working days: the end (23:59:59 local) of the
 * slaDays-th working day after the activation day. slaDays = 0 → end of the activation day, or of the next
 * working day if activated on a day off.
 */
export function dueAt(start: Date, slaDays: number, timeZone: string, isWorkingDay: WorkingDayFn = mondayToFriday): Date {
  let day = localDate(start, timeZone);
  if (slaDays <= 0) {
    while (!isWorkingDay(day)) day = nextDate(day);
  } else {
    let counted = 0;
    while (counted < slaDays) {
      day = nextDate(day);
      if (isWorkingDay(day)) counted++;
    }
  }
  return zonedTimeToUtc(day, "23:59:59", timeZone);
}
