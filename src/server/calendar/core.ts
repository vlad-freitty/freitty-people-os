import type { CalendarEvent, CalendarLayer, LayerTarget } from "@prisma/client";
import type { Tx } from "@/server/db";
import { addMonths, toIsoDate } from "@/lib/dates";
import type { WorkingDayFn } from "@/server/requests/sla";

/**
 * A person's calendar = the layers assigned to their company, department (and its parents), location or to them
 * personally (PRD 5). Non-working layers and events affect absence day counts and SLA; informational ones only show.
 */

export const DEFAULT_WORK_WEEK = [1, 2, 3, 4, 5];

type Person = { id: string; companyId: string; departmentId: string; locationId: string | null };

/** ISO weekday of a "YYYY-MM-DD": 1 = Monday … 7 = Sunday. */
export function isoWeekday(isoDate: string): number {
  const d = new Date(`${isoDate}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

export function nextIso(isoDate: string, days = 1): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = nextIso(d)) out.push(d);
  return out;
}

async function departmentChain(tx: Tx, departmentId: string): Promise<string[]> {
  const chain: string[] = [];
  let current: string | null = departmentId;
  while (current && !chain.includes(current)) {
    chain.push(current);
    const d: { parentId: string | null } | null = await tx.department.findUnique({ where: { id: current }, select: { parentId: true } });
    current = d?.parentId ?? null;
  }
  return chain;
}

/** Assignment targets that apply to a person. */
export async function targetsFor(tx: Tx, p: Person): Promise<{ targetType: LayerTarget; targetId: string }[]> {
  const depts = await departmentChain(tx, p.departmentId);
  return [
    { targetType: "company", targetId: p.companyId },
    ...depts.map((id) => ({ targetType: "department" as const, targetId: id })),
    ...(p.locationId ? [{ targetType: "location" as const, targetId: p.locationId }] : []),
    { targetType: "employee", targetId: p.id },
  ];
}

export async function assignedLayerIds(tx: Tx, p: Person): Promise<string[]> {
  const targets = await targetsFor(tx, p);
  const rows = await tx.layerAssignment.findMany({
    where: { OR: targets.map((t) => ({ targetType: t.targetType, targetId: t.targetId })), layer: { deletedAt: null } },
    select: { layerId: true },
  });
  return [...new Set(rows.map((r) => r.layerId))];
}

/** Working weekdays: location → company → Mon–Fri. */
export async function workWeekFor(tx: Tx, p: Person): Promise<number[]> {
  if (p.locationId) {
    const w = await tx.workWeek.findUnique({ where: { locationId: p.locationId } });
    if (w) return w.days;
  }
  const w = await tx.workWeek.findUnique({ where: { companyId: p.companyId } });
  return w?.days ?? DEFAULT_WORK_WEEK;
}

/** Concrete dates an event covers inside [from, to] — yearly events repeat by month/day (Feb 29 → Feb 28). */
export function occurrences(e: Pick<CalendarEvent, "date" | "endDate" | "recurrence">, from: string, to: string): string[] {
  const start = toIsoDate(e.date)!;
  const length = e.endDate ? Math.round((e.endDate.getTime() - e.date.getTime()) / 86_400_000) : 0;
  const spans: string[] = [];
  const addSpan = (first: string) => {
    for (let i = 0; i <= length; i++) {
      const d = nextIso(first, i);
      if (d >= from && d <= to) spans.push(d);
    }
  };
  if (e.recurrence === "none") {
    addSpan(start);
    return spans;
  }
  const firstYear = Math.max(Number(start.slice(0, 4)), Number(from.slice(0, 4)) - 1);
  const lastYear = Number(to.slice(0, 4));
  for (let y = firstYear; y <= lastYear; y++) {
    const shifted = toIsoDate(addMonths(e.date, (y - Number(start.slice(0, 4))) * 12))!;
    addSpan(shifted);
  }
  return spans;
}

export function isNonWorkingEvent(e: { nonWorking: boolean | null }, layer: Pick<CalendarLayer, "effect">) {
  return e.nonWorking ?? layer.effect === "non_working";
}

/** Dates in [from, to] that are non-working holidays for the person (weekends not included). */
export async function nonWorkingDates(tx: Tx, p: Person, from: string, to: string): Promise<Set<string>> {
  const layerIds = await assignedLayerIds(tx, p);
  if (layerIds.length === 0) return new Set();
  const events = await tx.calendarEvent.findMany({
    where: {
      layerId: { in: layerIds },
      deletedAt: null,
      OR: [{ recurrence: "yearly" }, { date: { lte: new Date(`${to}T00:00:00Z`) } }],
    },
    include: { layer: { select: { effect: true } } },
  });
  const out = new Set<string>();
  for (const e of events) if (isNonWorkingEvent(e, e.layer)) for (const d of occurrences(e, from, to)) out.add(d);
  return out;
}

/** A working-day predicate for one person over a date window — used by absences and SLA. */
export async function workingDayFn(tx: Tx, p: Person, from: string, to: string): Promise<WorkingDayFn> {
  const [week, holidays] = await Promise.all([workWeekFor(tx, p), nonWorkingDates(tx, p, from, to)]);
  return (iso) => week.includes(isoWeekday(iso)) && !holidays.has(iso);
}

/** Days an absence takes: working days by the person's calendar, or calendar days; a half day counts 0.5. */
export async function countAbsenceDays(tx: Tx, p: Person, start: string, end: string, opts: { halfDay: boolean; mode: "working" | "calendar" }) {
  if (end < start) return 0;
  const isWorking = opts.mode === "working" ? await workingDayFn(tx, p, start, end) : () => true;
  const days = eachDay(start, end).filter(isWorking).length;
  return opts.halfDay && days > 0 ? days - 0.5 : days;
}

export async function loadPerson(tx: Tx, employeeId: string): Promise<Person & { hireDate: Date | null }> {
  return tx.employee.findUniqueOrThrow({
    where: { id: employeeId },
    select: { id: true, companyId: true, departmentId: true, locationId: true, hireDate: true },
  });
}

