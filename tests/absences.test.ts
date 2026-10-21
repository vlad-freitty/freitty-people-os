/** Phase 2 acceptance: calendars, policies, balance ledger, absences (PRD 8, phase 2 "Готово, коли"). */
import { beforeEach, describe, expect, it } from "vitest";
import { parseIsoDate } from "@/lib/dates";
import { prisma } from "@/server/db";
import { ForbiddenError, ValidationError } from "@/server/errors";
import { currentBalance, syncBalance } from "@/server/absences/balance";
import { countAbsenceDays, loadPerson } from "@/server/calendar/core";
import { parseIcs } from "@/server/calendar/ics";
import { actOnStep, startRequest } from "@/server/requests/engine";
import { adjustBalance, getBalances, runDailyBalances } from "@/server/services/absences";
import { calendarFeed, calendarFeedUrl, calendarView, importEvents } from "@/server/services/calendar";
import { ensureAbsenceTypes, ensureHolidayLayer, ensureSystemLayers, FREITTY_STANDARD, HOLIDAYS } from "@/server/seed/calendar";
import { activeSteps, buildEngineWorld } from "./engine-world";
import { actorFor } from "./helpers";

type World = Awaited<ReturnType<typeof buildEngineWorld>>;
let w: World;
let ohio: { id: string; userId: string | null };
let types: Record<string, string>;
let standardId: string;

const at = (iso: string) => new Date(`${iso}T09:00:00Z`);

beforeEach(async () => {
  w = await buildEngineWorld();
  await ensureSystemLayers(prisma);
  await ensureAbsenceTypes(prisma);
  types = Object.fromEntries((await prisma.absenceType.findMany()).map((t) => [t.code, t.id]));
  standardId = (await prisma.absencePolicy.create({ data: { ...FREITTY_STANDARD, absenceTypeId: types.vacation } })).id;
  await prisma.absencePolicyAssignment.create({ data: { policyId: standardId, absenceTypeId: types.vacation, companyId: w.companies.a.id } });

  const columbus = await prisma.location.create({ data: { name: "Columbus, OH", country: "US", state: "Ohio", timezone: "America/New_York" } });
  const role = await prisma.role.findUniqueOrThrow({ where: { code: "user" } });
  const user = await prisma.user.create({ data: { email: "ohio@example.test", roleId: role.id } });
  ohio = await prisma.employee.create({
    data: {
      firstName: "Ohio",
      lastName: "Test",
      workEmail: "ohio@example.test",
      companyId: w.companies.a.id,
      departmentId: w.departments.csNight.id,
      locationId: columbus.id,
      position: "CS Agent",
      employmentType: "contractor",
      hireDate: parseIsoDate("2025-05-01"),
      userId: user.id,
    },
  });
  await ensureHolidayLayer(prisma, {
    nameUk: "Свята Україна",
    nameEn: "Ukraine holidays",
    color: "#2563eb",
    effect: "informational",
    holidays: HOLIDAYS.UA_HOLIDAYS,
    assign: [{ targetType: "location", targetId: w.location.id }],
  });
  await ensureHolidayLayer(prisma, {
    nameUk: "US Federal",
    nameEn: "US Federal",
    color: "#b91c1c",
    effect: "non_working",
    holidays: HOLIDAYS.US_FEDERAL,
    assign: [{ targetType: "location", targetId: columbus.id }],
  });
});

async function ledger(employeeId: string) {
  const rows = await prisma.absenceLedgerEntry.findMany({ where: { balance: { employeeId } }, orderBy: [{ date: "asc" }, { createdAt: "asc" }] });
  return rows.map((r) => [r.type, Number(r.amount), r.date.toISOString().slice(0, 10)]);
}

describe("policy «10 днів, згорають у річницю найму»", () => {
  it("accrues 10 days on the hire date and burns the rest on the anniversary, idempotently", async () => {
    const { P } = w.people;
    await prisma.employee.update({ where: { id: P.id }, data: { hireDate: parseIsoDate("2025-03-10") } });

    await syncBalance(prisma, P.id, at("2025-03-10"));
    expect(await currentBalance(prisma, P.id, types.vacation)).toBe(10);
    await syncBalance(prisma, P.id, at("2026-03-09"));
    expect(await currentBalance(prisma, P.id, types.vacation)).toBe(10); // the day before the anniversary nothing has burnt

    await syncBalance(prisma, P.id, at("2026-03-10"));
    await syncBalance(prisma, P.id, at("2026-03-10")); // the daily job may run twice
    expect(await ledger(P.id)).toEqual([
      ["accrual", 10, "2025-03-10"],
      ["accrual", 10, "2026-03-10"],
      ["expiry", -10, "2026-03-10"],
    ]);
    expect(await currentBalance(prisma, P.id, types.vacation)).toBe(10);
  });

  it("only the unused part burns", async () => {
    const { P } = w.people;
    await prisma.employee.update({ where: { id: P.id }, data: { hireDate: parseIsoDate("2025-03-10") } });
    await syncBalance(prisma, P.id, at("2025-06-01"));
    const b = await prisma.absenceBalance.findFirstOrThrow({ where: { employeeId: P.id } });
    await prisma.absenceLedgerEntry.create({ data: { balanceId: b.id, type: "usage", amount: -3, date: parseIsoDate("2025-06-01") } });
    await syncBalance(prisma, P.id, at("2026-03-10"));
    expect((await ledger(P.id)).find((e) => e[0] === "expiry")).toEqual(["expiry", -7, "2026-03-10"]);
  });

  it("hire on 29 February: the anniversary falls on 28 February in a non-leap year", async () => {
    const { P } = w.people;
    await prisma.employee.update({ where: { id: P.id }, data: { hireDate: parseIsoDate("2024-02-29") } });
    await syncBalance(prisma, P.id, at("2025-02-27"));
    expect(await ledger(P.id)).toEqual([["accrual", 10, "2024-02-29"]]);
    await syncBalance(prisma, P.id, at("2025-02-28"));
    expect(await ledger(P.id)).toEqual([
      ["accrual", 10, "2024-02-29"],
      ["accrual", 10, "2025-02-28"],
      ["expiry", -10, "2025-02-28"],
    ]);
    await syncBalance(prisma, P.id, at("2028-02-29"));
    expect((await prisma.absenceBalance.findMany({ where: { employeeId: P.id }, orderBy: { periodStart: "asc" } })).map((x) => x.periodStart.toISOString().slice(0, 10))).toEqual([
      "2024-02-29",
      "2025-02-28",
      "2026-02-28",
      "2027-02-28",
      "2028-02-29",
    ]);
  });

  it("the daily job body books for everyone and changes nothing on a second run", async () => {
    await prisma.employee.updateMany({ where: { companyId: w.companies.a.id }, data: { hireDate: parseIsoDate("2025-01-15") } });
    const first = await runDailyBalances(at("2026-02-01"));
    expect(first.booked).toBeGreaterThan(0);
    const second = await runDailyBalances(at("2026-02-01"));
    expect(second.booked).toBe(0);
  });
});

describe("other policy settings", () => {
  async function withPolicy(data: Partial<typeof FREITTY_STANDARD> & Record<string, unknown>, hire: string) {
    const policy = await prisma.absencePolicy.create({ data: { ...FREITTY_STANDARD, absenceTypeId: types.vacation, name: `p-${Math.random()}`, ...data } });
    const { P } = w.people;
    await prisma.employee.update({ where: { id: P.id }, data: { hireDate: parseIsoDate(hire) } });
    await prisma.absencePolicyAssignment.create({ data: { policyId: policy.id, absenceTypeId: types.vacation, employeeId: P.id } });
    return P.id;
  }

  it("monthly accrual from 1 January: 12 days a year, 1 per month", async () => {
    const id = await withPolicy({ daysPerPeriod: 12, accrual: "monthly", periodStart: "jan_1" } as never, "2026-01-01");
    await syncBalance(prisma, id, at("2026-03-15"));
    expect(await currentBalance(prisma, id, types.vacation)).toBe(3);
  });

  it("a partial first year on jan_1 + upfront is pro-rated to half days", async () => {
    const id = await withPolicy({ periodStart: "jan_1" } as never, "2026-07-01");
    await syncBalance(prisma, id, at("2026-07-01"));
    expect(await currentBalance(prisma, id, types.vacation)).toBe(5); // 184/365 of 10 → 5.0
  });

  it("carryover keeps up to N days, the rest burns", async () => {
    const id = await withPolicy({ carryoverMax: 3 } as never, "2025-03-10");
    await syncBalance(prisma, id, at("2025-04-01"));
    const b = await prisma.absenceBalance.findFirstOrThrow({ where: { employeeId: id } });
    await prisma.absenceLedgerEntry.create({ data: { balanceId: b.id, type: "usage", amount: -5, date: parseIsoDate("2025-04-01") } });
    await syncBalance(prisma, id, at("2026-03-10"));
    expect(await currentBalance(prisma, id, types.vacation)).toBe(13);
    const kinds = (await ledger(id)).map((e) => `${e[0]}:${e[1]}`);
    expect(kinds).toEqual(expect.arrayContaining(["carryover:-3", "carryover:3", "expiry:-2"]));
  });

  it("'never' keeps everything", async () => {
    const id = await withPolicy({ expiry: "never" } as never, "2024-03-10");
    await syncBalance(prisma, id, at("2026-03-10"));
    expect(await currentBalance(prisma, id, types.vacation)).toBe(30);
  });
});

describe("non-working days are not deducted", () => {
  it("weekend and a non-working holiday are skipped; an informational layer does not matter", async () => {
    const kyiv = await loadPerson(prisma, w.people.U.id);
    // Fri 23 Oct – Mon 26 Oct 2026
    expect(await countAbsenceDays(prisma, kyiv, "2026-10-23", "2026-10-26", { halfDay: false, mode: "working" })).toBe(2);
    const extra = await prisma.calendarLayer.create({ data: { nameUk: "Неробочий день", color: "#000000", effect: "non_working" } });
    await prisma.calendarEvent.create({ data: { layerId: extra.id, titleUk: "Свято", date: parseIsoDate("2026-10-26") } });
    await prisma.layerAssignment.create({ data: { layerId: extra.id, targetType: "company", targetId: w.companies.a.id } });
    expect(await countAbsenceDays(prisma, kyiv, "2026-10-23", "2026-10-26", { halfDay: false, mode: "working" })).toBe(1);
    // Ukrainian layer is informational: 24 Aug 2026 (Monday) is still a working day
    expect(await countAbsenceDays(prisma, kyiv, "2026-08-24", "2026-08-24", { halfDay: false, mode: "working" })).toBe(1);
    // calendar-day policies count everything
    expect(await countAbsenceDays(prisma, kyiv, "2026-10-23", "2026-10-26", { halfDay: false, mode: "calendar" })).toBe(4);
  });

  it("a vacation through the request engine deducts working days only", async () => {
    const { U, H } = w.people;
    // U is a contractor in the base world; contractors have no PTO balance (phase 6)
    await prisma.employee.update({ where: { id: U.id }, data: { hireDate: parseIsoDate("2025-01-15"), employmentType: "employee" } });
    const ohioPerson = await loadPerson(prisma, ohio.id);
    // in Ohio, Thanksgiving (26 Nov) is non-working
    expect(await countAbsenceDays(prisma, ohioPerson, "2026-11-25", "2026-11-27", { halfDay: false, mode: "working" })).toBe(2);

    const user = await actorFor(U);
    const vacationBalance = async () => (await getBalances(user, U.id)).balances.find((b) => b.type.code === "vacation")!.balance;
    const before = await vacationBalance();
    const { id } = await startRequest(user, { requestTypeId: w.templates.absence, values: { absence_type: types.vacation, dates: { from: "2026-12-04", to: "2026-12-07" } } });
    // two approvals of one group: the direct manager (no manager set → the department head) and Head of People
    // (nobody has that role in the test world → CEO)
    const [manager, hop] = await activeSteps(id);
    expect(manager.assigneeId).toBe(H.id);
    expect(hop.assigneeId).toBe(w.people.C.id);
    await actOnStep(w.actors.H, manager.id, { action: "approve" });
    expect(await prisma.absence.count({ where: { employeeId: U.id } })).toBe(0); // not approved until both confirm
    await actOnStep(w.actors.C, hop.id, { action: "approve" });

    const absence = await prisma.absence.findFirstOrThrow({ where: { employeeId: U.id } });
    expect(Number(absence.days)).toBe(2); // Fri + Mon
    expect(await vacationBalance()).toBe(before - 2);
  });

  it("sick leave needs no document and no approval (phase 6); without a policy it does not touch any balance", async () => {
    const { U } = w.people;
    await prisma.employee.update({ where: { id: U.id }, data: { hireDate: parseIsoDate("2025-01-15") } });
    const user = await actorFor(U);
    const { id } = await startRequest(user, { requestTypeId: w.templates.absence, values: { absence_type: types.sick_leave, dates: { from: "2026-11-02", to: "2026-11-03" } } });
    expect((await prisma.request.findUniqueOrThrow({ where: { id } })).status).toBe("done");
    expect(await prisma.absence.count({ where: { employeeId: U.id, typeId: types.sick_leave } })).toBe(1);
    expect(await prisma.absenceLedgerEntry.count({ where: { type: "usage" } })).toBe(0);
  });

  it("not enough balance does not block the request (phase 6) — it is a warning", async () => {
    const { U } = w.people;
    await prisma.employee.update({ where: { id: U.id }, data: { hireDate: parseIsoDate("2025-01-15") } });
    const user = await actorFor(U);
    const { id } = await startRequest(user, { requestTypeId: w.templates.absence, values: { absence_type: types.vacation, dates: { from: "2026-11-02", to: "2026-11-20" } } });
    expect((await prisma.request.findUniqueOrThrow({ where: { id } })).status).toBe("in_progress");
  });

  it("broken dates are still refused", async () => {
    const user = await actorFor(w.people.U);
    await expect(
      startRequest(user, { requestTypeId: w.templates.absence, values: { absence_type: types.vacation, dates: { from: "2026-11-20", to: "2026-11-02" } } }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("a dept head's own request goes to the head above, never to themselves", async () => {
    const { H } = w.people;
    await prisma.employee.update({ where: { id: H.id }, data: { hireDate: parseIsoDate("2025-01-15") } });
    const { id } = await startRequest(w.actors.H, { requestTypeId: w.templates.absence, values: { absence_type: types.day_off, dates: { from: "2026-11-02", to: "2026-11-02" } } });
    const [manager, hop] = await activeSteps(id);
    expect(manager.assigneeId).not.toBe(H.id);
    expect(manager.status).toBe("needs_assignment"); // CS has no parent department in the test world
    expect(hop.assigneeId).toBe(w.people.C.id);
  });
});

describe("people in Kyiv and in Ohio see different holidays", () => {
  it("each sees their own location's layer, and only US holidays are non-working in Ohio", async () => {
    const kyiv = await calendarView(w.actors.U, { from: "2026-11-01", to: "2026-12-31" });
    const us = await calendarView(await actorFor(ohio), { from: "2026-11-01", to: "2026-12-31" });
    const titles = (v: typeof kyiv) => v.items.filter((i) => i.kind === "event").map((i) => i.titleEn);
    expect(titles(kyiv)).toContain("Christmas");
    expect(titles(kyiv)).not.toContain("Thanksgiving Day");
    expect(titles(us)).toContain("Thanksgiving Day");
    expect(titles(us)).not.toContain("Christmas");
    expect(us.items.find((i) => i.titleEn === "Thanksgiving Day")?.nonWorking).toBe(true);
    expect(kyiv.items.find((i) => i.titleEn === "Christmas")?.nonWorking).toBe(false);
  });

  it("birthdays are shown without the year and only when allowed", async () => {
    const view = await calendarView(w.actors.U, { from: "2027-03-01", to: "2027-03-31" });
    const birthdays = view.items.filter((i) => i.kind === "birthday").map((i) => i.title);
    expect(birthdays).toContain("U Test"); // born 1990-03-14
    expect(birthdays).not.toContain("P Test"); // opted out
  });

  it("the personal ICS feed works and can be revoked", async () => {
    const { path } = await calendarFeedUrl(w.actors.U);
    const token = path.split("/").pop()!.replace(".ics", "");
    const ics = await calendarFeed(token);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("SUMMARY:Різдво");
    await calendarFeedUrl(w.actors.U, true);
    expect(await calendarFeed(token)).toBeNull();
  });
});

describe("import and adjustments", () => {
  it("ICS import: preview shows duplicates and saves nothing; commit creates events", async () => {
    const layer = await prisma.calendarLayer.create({ data: { nameUk: "Події компанії", color: "#000000", effect: "informational" } });
    const ics = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "DTSTART;VALUE=DATE:20261224",
      "DTEND;VALUE=DATE:20261226",
      "SUMMARY:Корпоратив\\, вечірка",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "DTSTART;VALUE=DATE:20260101",
      "RRULE:FREQ=YEARLY",
      "SUMMARY:Новий рік",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    expect(parseIcs(ics).events).toEqual([
      { title: "Корпоратив, вечірка", date: "2026-12-24", endDate: "2026-12-25", recurrence: "none" },
      { title: "Новий рік", date: "2026-01-01", endDate: null, recurrence: "yearly" },
    ]);
    const preview = await importEvents(w.actors.S, layer.id, { format: "ics", content: ics });
    expect(preview).toMatchObject({ committed: false, summary: { create: 2, duplicate: 0, error: 0 } });
    expect(await prisma.calendarEvent.count({ where: { layerId: layer.id } })).toBe(0);
    await importEvents(w.actors.S, layer.id, { format: "ics", content: ics, commit: true });
    const again = await importEvents(w.actors.S, layer.id, { format: "ics", content: ics });
    expect(again.summary).toMatchObject({ create: 0, duplicate: 2 });
  });

  it("CSV import reports errors per line", async () => {
    const layer = await prisma.calendarLayer.create({ data: { nameUk: "CSV", color: "#000000", effect: "non_working" } });
    const csv = "date,title_uk,non_working\n2026-12-31,Короткий день,ні\n31.12.2026,Погана дата,\n";
    const res = await importEvents(w.actors.S, layer.id, { format: "csv", content: csv, commit: true });
    expect(res.committed).toBe(false);
    expect(res.rows.map((r) => r.action)).toEqual(["create", "error"]);
  });

  it("manual adjustment: superadmin only, with a comment, audited", async () => {
    const { P } = w.people;
    await prisma.employee.update({ where: { id: P.id }, data: { hireDate: parseIsoDate("2025-01-15") } });
    await expect(adjustBalance(w.actors.H, P.id, { absenceTypeId: types.vacation, amount: 2, comment: "x" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(adjustBalance(w.actors.S, P.id, { absenceTypeId: types.vacation, amount: 2 })).rejects.toThrow();
    const res = await adjustBalance(w.actors.S, P.id, { absenceTypeId: types.vacation, amount: 2.5, comment: "Початковий залишок" });
    expect(res.balance).toBe(12.5);
    expect(await prisma.auditLog.count({ where: { action: "balance.adjust" } })).toBe(1);
  });
});
