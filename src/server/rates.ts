import { addDays } from "@/lib/dates";

type RateLike = { effectiveFrom: Date; effectiveTo: Date | null };

/** The rate in force on `date` (date-only, UTC midnight). Used by every calculation — PRD 6. */
export function rateAt<T extends RateLike>(rates: T[], date: Date): T | null {
  let best: T | null = null;
  for (const r of rates) {
    if (r.effectiveFrom > date) continue;
    if (r.effectiveTo && r.effectiveTo < date) continue;
    if (!best || r.effectiveFrom > best.effectiveFrom) best = r;
  }
  return best;
}

/**
 * Plans appending a new rate to a timeline: the new record must start after every existing one;
 * the currently open record (no effectiveTo) gets closed the day before. Existing amounts are never changed.
 */
export function planRateAppend<T extends RateLike & { id: string }>(rates: T[], effectiveFrom: Date) {
  const latest = rates.reduce<T | null>((acc, r) => (!acc || r.effectiveFrom > acc.effectiveFrom ? r : acc), null);
  if (latest && effectiveFrom <= latest.effectiveFrom) {
    return { ok: false as const, reason: "effective_from_must_be_after_latest" };
  }
  const toClose = latest && (!latest.effectiveTo || latest.effectiveTo >= effectiveFrom) ? latest : null;
  return { ok: true as const, close: toClose ? { id: toClose.id, effectiveTo: addDays(effectiveFrom, -1) } : null };
}
