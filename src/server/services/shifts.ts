import type { Prisma } from "@prisma/client";
import Papa from "papaparse";
import { z } from "zod";
import { isIsoDate, parseIsoDate, toIsoDate } from "@/lib/dates";
import { audit } from "@/server/audit";
import type { Actor } from "@/server/authz/actor";
import { assertCan, can, employeeScopeWhere, scopeOf } from "@/server/authz/policy";
import { prisma, type Tx } from "@/server/db";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { localDate, zonedTimeToUtc } from "@/server/requests/sla";
import { isIanaTimezone } from "./org";

/**
 * Shifts (PRD 6). Times are entered as local wall-clock time of the shift's time zone (the employee's location,
 * else UTC) and stored in UTC. A shift belongs to the date it starts on in that zone — over midnight included.
 */

const LOCAL_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}$/;
const MAX_SHIFT_MS = 24 * 3600_000;

export function toUtc(local: string, tz: string): Date {
  if (!LOCAL_RE.test(local)) throw new ValidationError({ time: "expected YYYY-MM-DD HH:mm" });
  const [date, time] = local.replace("T", " ").split(" ");
  if (!isIsoDate(date)) throw new ValidationError({ time: "invalid date" });
  return zonedTimeToUtc(date, `${time}:00`, tz);
}

/** "YYYY-MM-DDTHH:mm" wall-clock time of an instant in a zone — for forms and exports. */
export function toLocal(instant: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export const shiftMinutes = (s: { startAt: Date; endAt: Date }) => Math.round((s.endAt.getTime() - s.startAt.getTime()) / 60_000);

async function shiftZone(tx: Tx, employeeId: string, explicit?: string | null) {
  if (explicit) {
    if (!isIanaTimezone(explicit)) throw new ValidationError({ timezone: "invalid_timezone" });
    return explicit;
  }
  const e = await tx.employee.findUniqueOrThrow({ where: { id: employeeId }, select: { location: { select: { timezone: true } } } });
  return e.location?.timezone ?? "UTC";
}

/** A shift may not be created or changed inside a locked payment period of its company. */
async function assertPeriodOpen(tx: Tx, companyId: string, workDate: Date) {
  const locked = await tx.paymentPeriod.findFirst({ where: { companyId, status: "locked", periodStart: { lte: workDate }, periodEnd: { gte: workDate } } });
  if (locked) throw new ConflictError("the payment period is locked");
}

const shiftInput = z.object({
  employeeId: z.string().uuid(),
  start: z.string(),
  end: z.string(),
  shiftType: z.string().trim().min(1).max(40).default("regular"),
  departmentId: z.string().uuid().nullish(),
  companyId: z.string().uuid().nullish(),
  timezone: z.string().nullish(),
});

type ShiftDraft = {
  employeeId: string;
  companyId: string;
  departmentId: string;
  locationId: string | null;
  startAt: Date;
  endAt: Date;
  timezone: string;
  workDate: Date;
  shiftType: string;
};

/** Validates and normalizes one shift; shared by the API and the CSV import. */
async function draftShift(tx: Tx, input: z.infer<typeof shiftInput>, ignoreId?: string): Promise<ShiftDraft> {
  const e = await tx.employee.findFirst({ where: { id: input.employeeId, deletedAt: null } });
  if (!e) throw new ValidationError({ employeeId: "not_found" });
  const departmentId = input.departmentId ?? e.departmentId;
  const dept = await tx.department.findFirst({ where: { id: departmentId, deletedAt: null } });
  if (!dept) throw new ValidationError({ departmentId: "not_found" });
  // a shift may be booked to another company (cost split, PRD 6); the department must belong to it
  const companyId = input.companyId ?? dept.companyId;
  if (dept.companyId !== companyId) throw new ValidationError({ departmentId: "other_company" });
  const timezone = await shiftZone(tx, e.id, input.timezone);
  const startAt = toUtc(input.start, timezone);
  const endAt = toUtc(input.end, timezone);
  if (endAt <= startAt) throw new ValidationError({ end: "must_be_after_start" });
  if (endAt.getTime() - startAt.getTime() > MAX_SHIFT_MS) throw new ValidationError({ end: "longer_than_24h" });
  const overlap = await tx.shift.findFirst({
    where: { employeeId: e.id, deletedAt: null, id: ignoreId ? { not: ignoreId } : undefined, startAt: { lt: endAt }, endAt: { gt: startAt } },
  });
  if (overlap) throw new ValidationError({ start: "overlaps_another_shift" });
  const workDate = parseIsoDate(localDate(startAt, timezone));
  await assertPeriodOpen(tx, companyId, workDate);
  return { employeeId: e.id, companyId, departmentId, locationId: e.locationId, startAt, endAt, timezone, workDate, shiftType: input.shiftType };
}

function toDto(s: Prisma.ShiftGetPayload<{ include: { employee: { select: { firstName: true; lastName: true } }; department: { select: { name: true } }; company: { select: { name: true } } } }>) {
  return {
    id: s.id,
    employee: { id: s.employeeId, name: `${s.employee.firstName} ${s.employee.lastName}` },
    company: { id: s.companyId, name: s.company.name },
    department: { id: s.departmentId, name: s.department.name },
    start: toLocal(s.startAt, s.timezone),
    end: toLocal(s.endAt, s.timezone),
    startAt: s.startAt.toISOString(),
    endAt: s.endAt.toISOString(),
    timezone: s.timezone,
    workDate: toIsoDate(s.workDate)!,
    hours: Math.round((shiftMinutes(s) / 60) * 100) / 100,
    shiftType: s.shiftType,
    status: s.status,
    source: s.source,
  };
}

const include = {
  employee: { select: { firstName: true, lastName: true } },
  department: { select: { name: true } },
  company: { select: { name: true } },
} satisfies Prisma.ShiftInclude;

const listQuery = z.object({
  from: z.string().refine(isIsoDate),
  to: z.string().refine(isIsoDate),
  departmentId: z.string().uuid().optional(),
  employeeId: z.string().uuid().optional(),
  status: z.enum(["planned", "confirmed", "locked"]).optional(),
});

/** Shifts the actor may see: own, those of people in employees.view scope, and of departments they manage shifts for. */
export async function listShifts(actor: Actor, raw: unknown) {
  const q = listQuery.parse(raw);
  const visible: Prisma.ShiftWhereInput[] = [];
  const people = employeeScopeWhere(actor, "employees.view");
  if (people) visible.push({ employee: people });
  const shiftScope = scopeOf(actor, "shifts.manage");
  if (shiftScope === "all") visible.push({});
  if (shiftScope === "departments") visible.push({ departmentId: { in: actor.headedDepartmentIds } });
  if (!visible.length) return [];
  const rows = await prisma.shift.findMany({
    where: {
      AND: [
        { deletedAt: null, workDate: { gte: parseIsoDate(q.from), lte: parseIsoDate(q.to) } },
        visible.some((v) => Object.keys(v).length === 0) ? {} : { OR: visible },
        q.departmentId ? { departmentId: q.departmentId } : {},
        q.employeeId ? { employeeId: q.employeeId } : {},
        q.status ? { status: q.status } : {},
      ],
    },
    include,
    orderBy: [{ workDate: "asc" }, { startAt: "asc" }],
    take: 2000,
  });
  return rows.map(toDto);
}

function assertManage(actor: Actor, d: { employeeId: string; departmentId: string }) {
  // "self" never applies to shifts — people do not book their own pay
  if (!scopeOf(actor, "shifts.manage")) throw new ForbiddenError("shifts.manage");
  assertCan(actor, "shifts.manage", { departmentId: d.departmentId });
}

export async function createShift(actor: Actor, raw: unknown) {
  const input = shiftInput.parse(raw);
  return prisma.$transaction(async (tx) => {
    const d = await draftShift(tx, input);
    assertManage(actor, d);
    const row = await tx.shift.create({ data: { ...d, createdById: actor.userId }, include });
    await audit(tx, actor, { action: "shift.create", entity: "Shift", entityId: row.id, after: toDto(row), departmentId: d.departmentId, employeeId: d.employeeId });
    return toDto(row);
  });
}

export async function updateShift(actor: Actor, id: string, raw: unknown) {
  const input = shiftInput.parse(raw);
  return prisma.$transaction(async (tx) => {
    const before = await tx.shift.findFirst({ where: { id, deletedAt: null }, include });
    if (!before) throw new NotFoundError("shift");
    assertManage(actor, before);
    if (before.status === "locked") throw new ConflictError("locked shifts cannot be edited");
    const d = await draftShift(tx, input, id);
    assertManage(actor, d);
    // any change sends the shift back for confirmation
    const row = await tx.shift.update({ where: { id }, data: { ...d, status: "planned", confirmedById: null, confirmedAt: null }, include });
    await audit(tx, actor, { action: "shift.update", entity: "Shift", entityId: id, before: toDto(before), after: toDto(row), departmentId: d.departmentId, employeeId: d.employeeId });
    return toDto(row);
  });
}

export async function deleteShift(actor: Actor, id: string) {
  await prisma.$transaction(async (tx) => {
    const before = await tx.shift.findFirst({ where: { id, deletedAt: null }, include });
    if (!before) throw new NotFoundError("shift");
    assertManage(actor, before);
    if (before.status === "locked") throw new ConflictError("locked shifts cannot be deleted");
    await tx.shift.update({ where: { id }, data: { deletedAt: new Date() } });
    await audit(tx, actor, { action: "shift.delete", entity: "Shift", entityId: id, before: toDto(before), departmentId: before.departmentId, employeeId: before.employeeId });
  });
}

/** The department head confirms shifts (PRD 6); only confirmed shifts are paid. */
export async function confirmShifts(actor: Actor, raw: unknown) {
  const ids = z.array(z.string().uuid()).min(1).max(1000).parse((raw as { ids?: unknown })?.ids);
  return prisma.$transaction(async (tx) => {
    const shifts = await tx.shift.findMany({ where: { id: { in: ids }, deletedAt: null } });
    if (shifts.length !== ids.length) throw new NotFoundError("shift");
    for (const s of shifts) assertManage(actor, s);
    const toConfirm = shifts.filter((s) => s.status === "planned");
    const now = new Date();
    await tx.shift.updateMany({ where: { id: { in: toConfirm.map((s) => s.id) } }, data: { status: "confirmed", confirmedById: actor.employeeId, confirmedAt: now } });
    for (const s of toConfirm) {
      await audit(tx, actor, { action: "shift.confirm", entity: "Shift", entityId: s.id, departmentId: s.departmentId, employeeId: s.employeeId });
    }
    return { confirmed: toConfirm.length };
  });
}

// ───────────── CSV import with preview (decision 11) ─────────────

type ImportRow = { line: number; key: string; action: "create" | "unchanged" | "error"; errors: string[] };

const csvRow = z.object({
  work_email: z.string().toLowerCase().email(),
  start: z.string().regex(LOCAL_RE, "expected YYYY-MM-DD HH:mm"),
  end: z.string().regex(LOCAL_RE, "expected YYYY-MM-DD HH:mm"),
  shift_type: z.string().optional().transform((v) => v || "regular"),
  department: z.string().optional(),
  company: z.string().optional(),
});

export async function importShifts(actor: Actor, raw: unknown) {
  if (!scopeOf(actor, "shifts.manage")) throw new ForbiddenError("shifts.manage");
  const { csv, commit } = z.object({ csv: z.string().min(1).max(5_000_000), commit: z.boolean().default(false) }).parse(raw);
  const rows = Papa.parse<Record<string, string>>(csv.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim().toLowerCase(),
    transform: (v) => v.trim(),
  }).data;

  class Rollback extends Error {
    constructor(public rows: ImportRow[]) {
      super("rollback");
    }
  }
  const run = async (tx: Tx) => {
    const result: ImportRow[] = [];
    const [companies, departments] = await Promise.all([tx.company.findMany({ where: { deletedAt: null } }), tx.department.findMany({ where: { deletedAt: null } })]);
    for (const [i, r] of rows.entries()) {
      const row: ImportRow = { line: i + 2, key: `${r.work_email ?? ""} ${r.start ?? ""}`, action: "create", errors: [] };
      result.push(row);
      const parsed = csvRow.safeParse(r);
      if (!parsed.success) {
        row.errors.push(...parsed.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`));
        row.action = "error";
        continue;
      }
      const p = parsed.data;
      const e = await tx.employee.findFirst({ where: { workEmail: p.work_email, deletedAt: null } });
      if (!e) {
        row.errors.push(`work_email: "${p.work_email}" not found`);
        row.action = "error";
        continue;
      }
      const company = p.company ? companies.find((c) => c.name.toLowerCase() === p.company!.toLowerCase()) : null;
      if (p.company && !company) row.errors.push(`company: "${p.company}" not found`);
      const dept = p.department ? departments.find((d) => d.name.toLowerCase() === p.department!.toLowerCase() && (!company || d.companyId === company.id)) : null;
      if (p.department && !dept) row.errors.push(`department: "${p.department}" not found`);
      if (row.errors.length) {
        row.action = "error";
        continue;
      }
      try {
        const tz = await shiftZone(tx, e.id);
        const existing = await tx.shift.findFirst({ where: { employeeId: e.id, startAt: toUtc(p.start, tz), deletedAt: null } });
        if (existing) {
          row.action = "unchanged";
          continue;
        }
        const d = await draftShift(tx, { employeeId: e.id, start: p.start, end: p.end, shiftType: p.shift_type, departmentId: dept?.id ?? null, companyId: company?.id ?? dept?.companyId ?? null, timezone: null });
        if (!can(actor, "shifts.manage", { departmentId: d.departmentId })) throw new ValidationError({ department: "outside_your_departments" });
        const created = await tx.shift.create({ data: { ...d, source: "csv_import", createdById: actor.userId } });
        await audit(tx, actor, { action: "shift.import", entity: "Shift", entityId: created.id, departmentId: d.departmentId, employeeId: d.employeeId });
      } catch (err) {
        if (!(err instanceof ValidationError) && !(err instanceof ConflictError)) throw err;
        const details = err instanceof ValidationError ? (err.details as Record<string, string>) : { period: err.message };
        row.errors.push(...Object.entries(details).map(([k, v]) => `${k}: ${v}`));
        row.action = "error";
      }
    }
    return result;
  };

  let result: ImportRow[];
  let committed = false;
  try {
    result = await prisma.$transaction(
      async (tx) => {
        const r = await run(tx);
        if (!commit || r.some((x) => x.action === "error")) throw new Rollback(r);
        return r;
      },
      { timeout: 120_000 },
    );
    committed = true;
  } catch (err) {
    if (!(err instanceof Rollback)) throw err;
    result = err.rows;
  }
  return {
    committed,
    rows: result,
    summary: {
      create: result.filter((r) => r.action === "create").length,
      unchanged: result.filter((r) => r.action === "unchanged").length,
      error: result.filter((r) => r.action === "error").length,
    },
  };
}

export const SHIFT_IMPORT_COLUMNS = ["work_email", "start", "end", "shift_type", "department", "company"];
