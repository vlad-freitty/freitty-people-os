import { randomBytes } from "node:crypto";
import Papa from "papaparse";
import { z } from "zod";
import { isIsoDate, parseIsoDate, toIsoDate, toMonthDay } from "@/lib/dates";
import { audit } from "@/server/audit";
import type { Actor } from "@/server/authz/actor";
import { assertGlobal, employeeScopeWhere, hasPermission, scopeOf } from "@/server/authz/policy";
import { prisma } from "@/server/db";
import { NotFoundError, ValidationError } from "@/server/errors";
import { assignedLayerIds, isNonWorkingEvent, loadPerson, occurrences, workWeekFor } from "@/server/calendar/core";
import { buildIcs, parseIcs, type FeedEvent } from "@/server/calendar/ics";

// ───────────── settings (settings.manage) ─────────────

const layerInput = z.object({
  nameUk: z.string().trim().min(1).max(100),
  nameEn: z.string().trim().max(100).nullish(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  effect: z.enum(["non_working", "informational"]),
  visibility: z.enum(["all", "assigned_only"]),
});

const eventInput = z.object({
  titleUk: z.string().trim().min(1).max(200),
  titleEn: z.string().trim().max(200).nullish(),
  date: z.string().refine(isIsoDate),
  endDate: z.string().refine(isIsoDate).nullish(),
  recurrence: z.enum(["none", "yearly"]).default("none"),
  nonWorking: z.boolean().nullish(),
});

const targetsInput = z.array(z.object({ targetType: z.enum(["company", "department", "location", "employee"]), targetId: z.string().uuid() }));

export async function listLayers(actor: Actor) {
  assertGlobal(actor, "settings.manage");
  const layers = await prisma.calendarLayer.findMany({
    where: { deletedAt: null },
    include: { assignments: true, _count: { select: { events: { where: { deletedAt: null } } } } },
    orderBy: [{ systemKind: { sort: "asc", nulls: "first" } }, { nameUk: "asc" }],
  });
  return layers.map((l) => ({
    id: l.id,
    nameUk: l.nameUk,
    nameEn: l.nameEn,
    color: l.color,
    effect: l.effect,
    source: l.source,
    systemKind: l.systemKind,
    visibility: l.visibility,
    eventCount: l._count.events,
    assignments: l.assignments.map((a) => ({ targetType: a.targetType, targetId: a.targetId })),
  }));
}

export async function upsertLayer(actor: Actor, raw: unknown, id?: string) {
  assertGlobal(actor, "settings.manage");
  const input = layerInput.parse(raw);
  return prisma.$transaction(async (tx) => {
    const before = id ? await tx.calendarLayer.findFirst({ where: { id, deletedAt: null } }) : null;
    if (id && !before) throw new NotFoundError("layer");
    // system layers only show information; their effect cannot become non-working
    const data = before?.systemKind ? { ...input, effect: "informational" as const } : input;
    const row = id ? await tx.calendarLayer.update({ where: { id }, data }) : await tx.calendarLayer.create({ data: { ...data, createdById: actor.userId } });
    await audit(tx, actor, { action: id ? "calendar.layer.update" : "calendar.layer.create", entity: "CalendarLayer", entityId: row.id, before, after: row });
    return row;
  });
}

export async function deleteLayer(actor: Actor, id: string) {
  assertGlobal(actor, "settings.manage");
  const layer = await prisma.calendarLayer.findFirst({ where: { id, deletedAt: null } });
  if (!layer) throw new NotFoundError("layer");
  if (layer.systemKind) throw new ValidationError({ layer: "system layers cannot be deleted" });
  await prisma.$transaction(async (tx) => {
    await tx.calendarLayer.update({ where: { id }, data: { deletedAt: new Date() } });
    await audit(tx, actor, { action: "calendar.layer.delete", entity: "CalendarLayer", entityId: id, before: layer });
  });
}

export async function setLayerAssignments(actor: Actor, layerId: string, raw: unknown) {
  assertGlobal(actor, "settings.manage");
  const targets = targetsInput.parse(raw);
  const layer = await prisma.calendarLayer.findFirst({ where: { id: layerId, deletedAt: null }, include: { assignments: true } });
  if (!layer) throw new NotFoundError("layer");
  await prisma.$transaction(async (tx) => {
    await tx.layerAssignment.deleteMany({ where: { layerId } });
    const unique = [...new Map(targets.map((t) => [`${t.targetType}:${t.targetId}`, t])).values()];
    await tx.layerAssignment.createMany({ data: unique.map((t) => ({ layerId, ...t })) });
    await audit(tx, actor, { action: "calendar.layer.assign", entity: "CalendarLayer", entityId: layerId, before: layer.assignments, after: unique });
  });
}

export async function listEvents(actor: Actor, layerId: string) {
  assertGlobal(actor, "settings.manage");
  const rows = await prisma.calendarEvent.findMany({ where: { layerId, deletedAt: null }, orderBy: { date: "asc" } });
  return rows.map((e) => ({
    id: e.id,
    titleUk: e.titleUk,
    titleEn: e.titleEn,
    date: toIsoDate(e.date)!,
    endDate: toIsoDate(e.endDate),
    recurrence: e.recurrence,
    nonWorking: e.nonWorking,
  }));
}

function eventData(input: z.infer<typeof eventInput>) {
  if (input.endDate && input.endDate < input.date) throw new ValidationError({ endDate: "before_start" });
  return {
    titleUk: input.titleUk,
    titleEn: input.titleEn ?? null,
    date: parseIsoDate(input.date),
    endDate: input.endDate ? parseIsoDate(input.endDate) : null,
    recurrence: input.recurrence,
    nonWorking: input.nonWorking ?? null,
  };
}

export async function upsertEvent(actor: Actor, layerId: string, raw: unknown, id?: string) {
  assertGlobal(actor, "settings.manage");
  const input = eventInput.parse(raw);
  const layer = await prisma.calendarLayer.findFirst({ where: { id: layerId, deletedAt: null } });
  if (!layer || layer.systemKind) throw new NotFoundError("layer");
  return prisma.$transaction(async (tx) => {
    const before = id ? await tx.calendarEvent.findFirst({ where: { id, layerId, deletedAt: null } }) : null;
    if (id && !before) throw new NotFoundError("event");
    const data = eventData(input);
    const row = id ? await tx.calendarEvent.update({ where: { id }, data }) : await tx.calendarEvent.create({ data: { ...data, layerId, createdById: actor.userId } });
    await audit(tx, actor, { action: id ? "calendar.event.update" : "calendar.event.create", entity: "CalendarEvent", entityId: row.id, before, after: row });
    return { id: row.id };
  });
}

export async function deleteEvent(actor: Actor, layerId: string, id: string) {
  assertGlobal(actor, "settings.manage");
  const e = await prisma.calendarEvent.findFirst({ where: { id, layerId, deletedAt: null } });
  if (!e) throw new NotFoundError("event");
  await prisma.$transaction(async (tx) => {
    await tx.calendarEvent.update({ where: { id }, data: { deletedAt: new Date() } });
    await audit(tx, actor, { action: "calendar.event.delete", entity: "CalendarEvent", entityId: id, before: e });
  });
}

// ───────────── import (ICS / CSV) with preview ─────────────

const importInput = z.object({ format: z.enum(["ics", "csv"]), content: z.string().min(1).max(2_000_000), commit: z.boolean().default(false) });

type ImportRow = {
  line: number;
  titleUk: string;
  titleEn: string | null;
  date: string;
  endDate: string | null;
  recurrence: "none" | "yearly";
  nonWorking: boolean | null;
  action: "create" | "duplicate" | "error";
  errors: string[];
};

const yes = (v?: string) => (v ? ["1", "true", "yes", "так", "y"].includes(v.trim().toLowerCase()) : null);

function rowsFromCsv(content: string): ImportRow[] {
  // columns: date, end_date, title_uk, title_en, recurrence, non_working
  const parsed = Papa.parse<Record<string, string>>(content.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim().toLowerCase(),
    transform: (v) => v.trim(),
  });
  return parsed.data.map((r, i) => {
    const errors: string[] = [];
    if (!isIsoDate(r.date ?? "")) errors.push("date: expected YYYY-MM-DD");
    if (r.end_date && !isIsoDate(r.end_date)) errors.push("end_date: expected YYYY-MM-DD");
    if (!r.title_uk) errors.push("title_uk: required");
    const recurrence = r.recurrence === "yearly" ? "yearly" : "none";
    if (r.recurrence && !["yearly", "none"].includes(r.recurrence)) errors.push("recurrence: yearly | none");
    const nonWorking = r.non_working === undefined || r.non_working === "" ? null : yes(r.non_working);
    return {
      line: i + 2,
      titleUk: r.title_uk ?? "",
      titleEn: r.title_en || null,
      date: r.date ?? "",
      endDate: r.end_date || null,
      recurrence,
      nonWorking,
      action: errors.length ? "error" : "create",
      errors,
    };
  });
}

function rowsFromIcs(content: string): ImportRow[] {
  const { events, errors } = parseIcs(content);
  const rows: ImportRow[] = events.map((e, i) => ({
    line: i + 1,
    titleUk: e.title,
    titleEn: null,
    date: e.date,
    endDate: e.endDate,
    recurrence: e.recurrence,
    nonWorking: null,
    action: "create",
    errors: [],
  }));
  errors.forEach((message, i) => rows.push({ line: events.length + i + 1, titleUk: "", titleEn: null, date: "", endDate: null, recurrence: "none", nonWorking: null, action: "error", errors: [message] }));
  return rows;
}

/** Upload → preview with per-row errors → confirm (PRD 5). Duplicates (same date and title) are skipped. */
export async function importEvents(actor: Actor, layerId: string, raw: unknown) {
  assertGlobal(actor, "settings.manage");
  const input = importInput.parse(raw);
  const layer = await prisma.calendarLayer.findFirst({ where: { id: layerId, deletedAt: null } });
  if (!layer || layer.systemKind) throw new NotFoundError("layer");
  const rows = input.format === "ics" ? rowsFromIcs(input.content) : rowsFromCsv(input.content);
  const existing = await prisma.calendarEvent.findMany({ where: { layerId, deletedAt: null }, select: { date: true, titleUk: true } });
  const seen = new Set(existing.map((e) => `${toIsoDate(e.date)}|${e.titleUk.toLowerCase()}`));
  for (const r of rows) {
    if (r.action === "error") continue;
    const key = `${r.date}|${r.titleUk.toLowerCase()}`;
    if (seen.has(key)) r.action = "duplicate";
    seen.add(key);
  }
  const hasErrors = rows.some((r) => r.action === "error");
  let committed = false;
  if (input.commit && !hasErrors) {
    await prisma.$transaction(async (tx) => {
      const toCreate = rows.filter((r) => r.action === "create");
      await tx.calendarEvent.createMany({
        data: toCreate.map((r) => ({
          layerId,
          titleUk: r.titleUk,
          titleEn: r.titleEn,
          date: parseIsoDate(r.date),
          endDate: r.endDate ? parseIsoDate(r.endDate) : null,
          recurrence: r.recurrence,
          nonWorking: r.nonWorking,
          createdById: actor.userId,
        })),
      });
      if (layer.source === "manual" && existing.length === 0) {
        await tx.calendarLayer.update({ where: { id: layerId }, data: { source: input.format === "ics" ? "ics_import" : "csv_import" } });
      }
      await audit(tx, actor, { action: "calendar.import", entity: "CalendarLayer", entityId: layerId, after: { format: input.format, created: toCreate.length } });
    });
    committed = true;
  }
  return {
    committed,
    rows,
    summary: {
      create: rows.filter((r) => r.action === "create").length,
      duplicate: rows.filter((r) => r.action === "duplicate").length,
      error: rows.filter((r) => r.action === "error").length,
    },
  };
}

// ───────────── work week ─────────────

const workWeekInput = z.object({
  locationId: z.string().uuid().nullish(),
  companyId: z.string().uuid().nullish(),
  days: z.array(z.number().int().min(1).max(7)).min(1).max(7),
});

export async function listWorkWeeks(actor: Actor) {
  assertGlobal(actor, "settings.manage");
  const rows = await prisma.workWeek.findMany({ include: { location: { select: { name: true } }, company: { select: { name: true } } } });
  return rows.map((w) => ({ id: w.id, locationId: w.locationId, companyId: w.companyId, name: w.location?.name ?? w.company?.name ?? "", days: w.days }));
}

export async function upsertWorkWeek(actor: Actor, raw: unknown) {
  assertGlobal(actor, "settings.manage");
  const input = workWeekInput.parse(raw);
  if (!!input.locationId === !!input.companyId) throw new ValidationError({ target: "choose a location or a company" });
  const days = [...new Set(input.days)].sort();
  const where = input.locationId ? { locationId: input.locationId } : { companyId: input.companyId! };
  return prisma.$transaction(async (tx) => {
    const before = await tx.workWeek.findFirst({ where });
    const row = before ? await tx.workWeek.update({ where: { id: before.id }, data: { days } }) : await tx.workWeek.create({ data: { ...where, days } });
    await audit(tx, actor, { action: "calendar.workweek.set", entity: "WorkWeek", entityId: row.id, before, after: row });
    return row;
  });
}

// ───────────── calendar views ─────────────

const rangeInput = z.object({ from: z.string().refine(isIsoDate), to: z.string().refine(isIsoDate) }).refine((r) => r.from <= r.to && r.to <= addYearsIso(r.from, 3), "range");

function addYearsIso(iso: string, years: number) {
  return `${Number(iso.slice(0, 4)) + years}${iso.slice(4)}`;
}

export type CalendarItem = {
  date: string;
  kind: "event" | "birthday" | "anniversary" | "absence";
  title: string;
  titleEn?: string | null;
  layerId?: string;
  color: string;
  nonWorking: boolean;
  employeeId?: string;
  years?: number;
};

/** System layers (birthdays, anniversaries) are on when the layer exists and the viewer sees it. */
async function visibleLayers(layerIdsAssigned: string[]) {
  return prisma.calendarLayer.findMany({
    where: { deletedAt: null, OR: [{ visibility: "all" }, { id: { in: layerIdsAssigned } }] },
  });
}

/**
 * Calendar for the signed-in person (PRD 5): their layers plus layers shown to everyone, colleagues' birthdays
 * (without year, only if they allow it) and work anniversaries, and absences the viewer may see.
 */
export async function calendarView(actor: Actor, raw: unknown) {
  const { from, to } = rangeInput.parse(raw);
  if (!actor.employeeId) return { items: [] as CalendarItem[], workWeek: [1, 2, 3, 4, 5], layers: [] };
  const me = await loadPerson(prisma, actor.employeeId);
  const assigned = await assignedLayerIds(prisma, me);
  const layers = await visibleLayers(assigned);
  const items: CalendarItem[] = [];

  const eventLayers = layers.filter((l) => !l.systemKind);
  const events = await prisma.calendarEvent.findMany({
    where: { layerId: { in: eventLayers.map((l) => l.id) }, deletedAt: null, OR: [{ recurrence: "yearly" }, { date: { lte: parseIsoDate(to) } }] },
  });
  const layerById = new Map(layers.map((l) => [l.id, l]));
  for (const e of events) {
    const layer = layerById.get(e.layerId)!;
    // the non-working effect applies only to people the layer is assigned to
    const nonWorking = assigned.includes(layer.id) && isNonWorkingEvent(e, layer);
    for (const date of occurrences(e, from, to)) {
      items.push({ date, kind: "event", title: e.titleUk, titleEn: e.titleEn, layerId: layer.id, color: layer.color, nonWorking });
    }
  }

  const birthdays = layers.find((l) => l.systemKind === "birthdays");
  const anniversaries = layers.find((l) => l.systemKind === "work_anniversaries");
  if (birthdays || anniversaries) {
    const people = await prisma.employee.findMany({
      where: { deletedAt: null, status: { in: ["onboarding", "active", "offboarding"] } },
      select: { id: true, firstName: true, lastName: true, birthDate: true, showBirthday: true, hireDate: true },
    });
    const years = Array.from({ length: Number(to.slice(0, 4)) - Number(from.slice(0, 4)) + 1 }, (_, i) => Number(from.slice(0, 4)) + i);
    for (const p of people) {
      const name = `${p.firstName} ${p.lastName}`;
      if (birthdays && p.showBirthday && p.birthDate) {
        for (const y of years) {
          const date = clampMonthDay(y, toMonthDay(p.birthDate)!);
          if (date >= from && date <= to) items.push({ date, kind: "birthday", title: name, layerId: birthdays.id, color: birthdays.color, nonWorking: false, employeeId: p.id });
        }
      }
      if (anniversaries && p.hireDate) {
        for (const y of years) {
          const n = y - p.hireDate.getUTCFullYear();
          const date = clampMonthDay(y, toMonthDay(p.hireDate)!);
          if (n >= 1 && date >= from && date <= to) items.push({ date, kind: "anniversary", title: name, layerId: anniversaries.id, color: anniversaries.color, nonWorking: false, employeeId: p.id, years: n });
        }
      }
    }
  }

  for (const a of await visibleAbsences(actor, from, to)) {
    for (const date of occurrences({ date: a.startDate, endDate: a.endDate, recurrence: "none" }, from, to)) {
      items.push({ date, kind: "absence", title: `${a.employee.firstName} ${a.employee.lastName}`, titleEn: a.type.nameEn ?? a.type.nameUk, color: a.type.color, nonWorking: false, employeeId: a.employeeId });
    }
  }

  items.sort((a, b) => a.date.localeCompare(b.date));
  return {
    items,
    workWeek: await workWeekFor(prisma, me),
    layers: layers.map((l) => ({ id: l.id, nameUk: l.nameUk, nameEn: l.nameEn, color: l.color, assigned: assigned.includes(l.id), effect: l.effect })),
  };
}

function clampMonthDay(year: number, md: string) {
  if (md === "02-29" && !(year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0))) return `${year}-02-28`;
  return `${year}-${md}`;
}

/** Own absences always; with employees.view on departments/all — absences of people in scope (PRD 7 dashboards). */
export async function visibleAbsences(actor: Actor, from: string, to: string) {
  const scope = scopeOf(actor, "employees.view");
  const employeeWhere = scope && scope !== "self" ? employeeScopeWhere(actor, "employees.view")! : { id: actor.employeeId ?? "" };
  return prisma.absence.findMany({
    where: {
      status: "approved",
      startDate: { lte: parseIsoDate(to) },
      endDate: { gte: parseIsoDate(from) },
      employee: { ...employeeWhere, deletedAt: null },
    },
    include: { type: true, employee: { select: { firstName: true, lastName: true, departmentId: true } } },
    orderBy: { startDate: "asc" },
  });
}

// ───────────── ICS subscription ─────────────

export async function calendarFeedUrl(actor: Actor, rotate = false) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: actor.userId } });
  let token = user.calendarToken;
  if (!token || rotate) {
    token = randomBytes(24).toString("base64url");
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: actor.userId }, data: { calendarToken: token } });
      await audit(tx, actor, { action: rotate ? "calendar.feed.rotate" : "calendar.feed.create", entity: "User", entityId: actor.userId });
    });
  }
  return { path: `/api/calendar/${token}.ics` };
}

/** Combined calendar for Google Calendar & co. The token is the only credential — rotate it to revoke. */
export async function calendarFeed(token: string) {
  const user = await prisma.user.findFirst({ where: { calendarToken: token, isActive: true, deletedAt: null }, include: { employee: true } });
  if (!user?.employee) return null;
  const { loadActor } = await import("@/server/authz/actor");
  const actor = await loadActor(user.id);
  const today = new Date().toISOString().slice(0, 10);
  const from = `${Number(today.slice(0, 4)) - 1}-01-01`;
  const to = `${Number(today.slice(0, 4)) + 1}-12-31`;
  const { items } = await calendarView(actor, { from, to });
  const en = user.employee.locale === "en";
  const events: FeedEvent[] = items.map((i, n) => ({
    uid: `${i.kind}-${i.layerId ?? i.employeeId}-${i.date}-${n}`,
    title:
      i.kind === "birthday"
        ? `🎂 ${i.title}`
        : i.kind === "anniversary"
          ? `🎉 ${i.title} · ${i.years}`
          : i.kind === "absence"
            ? `${i.title} — ${i.titleEn ?? ""}`
            : (en && i.titleEn) || i.title,
    date: i.date,
  }));
  return buildIcs("People OS", events);
}

export function canSeeTeamAbsences(actor: Actor) {
  const scope = scopeOf(actor, "employees.view");
  return !!scope && scope !== "self" && hasPermission(actor, "employees.view");
}
