/**
 * Phase 3 acceptance: a model month of the CS team calculated by the system equals the hand calculation,
 * a contractor without an act cannot be approved (PRD 8, phase 3 "Готово, коли").
 */
import { beforeAll, describe, expect, it } from "vitest";
import { parseIsoDate } from "@/lib/dates";
import { prisma } from "@/server/db";
import { ConflictError, ForbiddenError, ValidationError } from "@/server/errors";
import { actOnStep, startRequest } from "@/server/requests/engine";
import { addAdjustment, calculatePeriod, createPeriod, exportRows, listBonuses, listPayments, lockPeriod, setPaymentStatus } from "@/server/services/payments";
import { confirmShifts, createShift, importShifts, listShifts, updateShift } from "@/server/services/shifts";
import { activeSteps, buildEngineWorld } from "./engine-world";
import { actorFor } from "./helpers";

type World = Awaited<ReturnType<typeof buildEngineWorld>>;
let w: World;
let O: { id: string; userId: string | null };
let periodId: string;
const d = parseIsoDate;

async function rate(employeeId: string, rateType: "hourly" | "per_shift" | "monthly", amount: number, from: string, to: string | null = null) {
  await prisma.rateHistory.create({ data: { employeeId, rateType, amount, currency: "USD", effectiveFrom: d(from), effectiveTo: to ? d(to) : null } });
}

async function shift(employeeId: string, start: string, end: string, confirm = true) {
  const s = await createShift(w.actors.S, { employeeId, start, end });
  if (confirm) await confirmShifts(w.actors.S, { ids: [s.id] });
  return s;
}

beforeAll(async () => {
  w = await buildEngineWorld();
  const { U, H, P } = w.people;
  await prisma.rateHistory.deleteMany({});
  await prisma.company.update({ where: { id: w.companies.a.id }, data: { nonWorkingShiftCoefficient: 1.5 } });

  const columbus = await prisma.location.create({ data: { name: "Columbus, OH", country: "US", timezone: "America/New_York" } });
  O = await prisma.employee.create({
    data: {
      firstName: "O",
      lastName: "Test",
      workEmail: "o@example.test",
      companyId: w.companies.a.id,
      departmentId: w.departments.csNight.id,
      locationId: columbus.id,
      position: "CS Agent",
      employmentType: "contractor",
    },
  });
  // company holiday on Wed 14 Oct, non-working for everyone in company A
  const layer = await prisma.calendarLayer.create({ data: { nameUk: "Свято компанії", color: "#000000", effect: "non_working" } });
  await prisma.calendarEvent.create({ data: { layerId: layer.id, titleUk: "День компанії", date: d("2026-10-14") } });
  await prisma.layerAssignment.create({ data: { layerId: layer.id, targetType: "company", targetId: w.companies.a.id } });

  await rate(U.id, "per_shift", 120, "2026-01-01");
  await rate(O.id, "hourly", 20, "2026-01-01");
  await rate(H.id, "monthly", 3000, "2026-01-01", "2026-10-15");
  await rate(H.id, "monthly", 3600, "2026-10-16");
  await rate(P.id, "hourly", 10, "2026-01-01", "2026-10-19");
  await rate(P.id, "hourly", 12, "2026-10-20");

  // U, Kyiv, per shift
  await shift(U.id, "2026-10-01 09:00", "2026-10-01 17:00");
  await shift(U.id, "2026-10-14 09:00", "2026-10-14 17:00"); // company holiday → ×1.5
  await shift(U.id, "2026-10-30 22:00", "2026-10-31 06:00"); // over midnight → counts on Friday 30 Oct
  await shift(U.id, "2026-09-30 22:00", "2026-10-01 06:00"); // starts in September → not October
  await shift(U.id, "2026-10-02 09:00", "2026-10-02 17:00", false); // planned, not confirmed → not paid
  // O, Ohio, hourly — times are Ohio wall clock even when entered from Kyiv
  await shift(O.id, "2026-10-05 08:00", "2026-10-05 16:30"); // 8.5 h
  await shift(O.id, "2026-10-31 21:00", "2026-11-01 01:00"); // Sat 31 Oct in Ohio (1 Nov in UTC) → weekend ×1.5
  // P, Kyiv, hourly with a raise on 20 Oct
  await shift(P.id, "2026-10-19 09:00", "2026-10-19 18:00"); // 9 h × 10
  await shift(P.id, "2026-10-20 09:00", "2026-10-20 13:30"); // 4.5 h × 12

  // bonus for U through the request engine (template 6)
  const { id } = await startRequest(w.actors.H, {
    requestTypeId: w.templates.bonus,
    values: { employee: U.id, amount: 200, period: "2026-10", reason: "CS incentive Q3", source: "cs_incentive" },
  });
  await actOnStep(w.actors.H, (await activeSteps(id))[0].id, { action: "approve" });
  await actOnStep(w.actors.C, (await activeSteps(id))[0].id, { action: "approve" });
  await actOnStep(w.actors.FIN, (await activeSteps(id))[0].id, { action: "complete" });

  periodId = (await createPeriod(w.actors.FIN, { companyId: w.companies.a.id, periodStart: "2026-10-01", periodEnd: "2026-10-31" })).id;
});

async function payment(employeeId: string) {
  const all = await listPayments(w.actors.FIN, { periodId });
  return all.find((p) => p.employee.id === employeeId)!;
}

describe("model month of the CS team", () => {
  it("matches the hand calculation", async () => {
    const res = await calculatePeriod(w.actors.FIN, periodId);
    expect(res.warnings).toEqual([]);
    const { U, H, P } = w.people;
    await addAdjustment(w.actors.FIN, (await payment(P.id)).id, { amount: 25.5, comment: "Компенсація таксі" });

    expect((await payment(U.id)).total).toBe("620.00"); // 120 + 180 + 120 + bonus 200
    expect((await payment(O.id)).total).toBe("290.00"); // 8.5 h × 20 + 4 h × 20 × 1.5
    expect((await payment(H.id)).total).toBe("3309.67"); // 3000 × 15/31 + 3600 × 16/31
    expect((await payment(P.id)).total).toBe("169.50"); // 90 + 54 + 25.50

    const u = await payment(U.id);
    expect(u.lines.map((l) => [l.kind, l.amount]).sort()).toEqual([
      ["bonus", "200.00"],
      ["shifts", "180.00"],
      ["shifts", "240.00"],
    ]);
    expect((await listPayments(w.actors.FIN, { periodId })).map((p) => p.employee.id).sort()).toEqual([U.id, O.id, H.id, P.id].sort());
  });

  it("recalculation keeps adjustments and does not touch approved payments", async () => {
    const { H, P } = w.people;
    await setPaymentStatus(w.actors.FIN, (await payment(H.id)).id, { status: "approved" });
    await prisma.rateHistory.updateMany({ where: { employeeId: H.id, amount: 3600 }, data: { amount: 9999 } });
    await calculatePeriod(w.actors.FIN, periodId);
    expect((await payment(H.id)).total).toBe("3309.67");
    expect((await payment(P.id)).total).toBe("169.50");
    expect((await listBonuses(w.actors.FIN, { status: "included" })).length).toBe(1);
  });

  it("only the shift's company period pays it — cost split comes from the shift itself", async () => {
    const other = await listShifts(w.actors.S, { from: "2026-10-01", to: "2026-10-31" });
    expect(other.every((s) => s.company.id === w.companies.a.id)).toBe(true);
    expect(other.find((s) => s.start === "2026-10-31T21:00")?.workDate).toBe("2026-10-31");
  });
});

describe("statuses", () => {
  it("a contractor cannot be approved without an act or invoice for the period", async () => {
    const { U } = w.people;
    const p = await payment(U.id);
    expect(p.documentOk).toBe(false);
    expect((await listPayments(w.actors.FIN, { periodId, filter: "waiting_documents" })).map((x) => x.employee.id)).toContain(U.id);
    await expect(setPaymentStatus(w.actors.FIN, p.id, { status: "approved" })).rejects.toMatchObject({ details: { status: "contractor_needs_act_or_invoice" } });

    await prisma.document.create({ data: { employeeId: U.id, type: "act", fileKey: "x", fileName: "act.pdf", mimeType: "application/pdf", size: 1, period: "2026-10" } });
    await setPaymentStatus(w.actors.FIN, p.id, { status: "documents_received" });
    await setPaymentStatus(w.actors.FIN, p.id, { status: "approved" });
    await expect(setPaymentStatus(w.actors.FIN, p.id, { status: "paid" } as never)).rejects.toThrow();
    await setPaymentStatus(w.actors.FIN, p.id, { status: "paid", paymentRef: "WISE-123" });
    expect((await payment(U.id)).status).toBe("paid");
    expect((await listBonuses(w.actors.FIN, { status: "paid" })).length).toBe(1);
  });

  it("an invoice whose validity covers the period also counts", async () => {
    await prisma.document.create({
      data: { employeeId: O.id, type: "invoice", fileKey: "y", fileName: "inv.pdf", mimeType: "application/pdf", size: 1, validFrom: d("2026-10-01"), validTo: d("2026-10-31") },
    });
    await setPaymentStatus(w.actors.FIN, (await payment(O.id)).id, { status: "approved" });
  });

  it("statuses cannot skip back or be set without payments.manage", async () => {
    const p = await payment(w.people.U.id);
    await expect(setPaymentStatus(w.actors.FIN, p.id, { status: "approved" })).rejects.toBeInstanceOf(ConflictError);
    await expect(setPaymentStatus(w.actors.H, p.id, { status: "approved" })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("a person sees only their own payments", async () => {
    const mine = await listPayments(w.actors.U);
    expect(mine.map((p) => p.employee.id)).toEqual([w.people.U.id]);
  });

  it("exports one row per payment with sums by kind", async () => {
    const { header, rows } = await exportRows(w.actors.FIN, periodId);
    expect(header).toContain("monthly_rate");
    const u = rows.find((r) => r[0] === "U Test")!;
    expect(u.slice(3, 9)).toEqual(["USD", 420, 0, 200, 0, 620]);
  });
});

describe("shifts", () => {
  it("dept head manages shifts of own departments only; users cannot book shifts", async () => {
    const { U, P } = w.people;
    await createShift(w.actors.H, { employeeId: U.id, start: "2026-11-03 09:00", end: "2026-11-03 17:00" });
    await expect(createShift(w.actors.H, { employeeId: P.id, start: "2026-11-03 09:00", end: "2026-11-03 17:00" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createShift(await actorFor(U), { employeeId: U.id, start: "2026-11-04 09:00", end: "2026-11-04 17:00" })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("overlaps and shifts longer than 24 h are rejected", async () => {
    const { U } = w.people;
    await expect(createShift(w.actors.S, { employeeId: U.id, start: "2026-11-03 16:00", end: "2026-11-03 20:00" })).rejects.toBeInstanceOf(ValidationError);
    await expect(createShift(w.actors.S, { employeeId: U.id, start: "2026-11-05 09:00", end: "2026-11-06 10:00" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("CSV import: preview, commit, re-import changes nothing", async () => {
    const csv = "work_email,start,end,shift_type\nu@example.test,2026-11-10 09:00,2026-11-10 17:00,regular\nu@example.test,2026-11-11 22:00,2026-11-12 06:00,night\n";
    expect((await importShifts(w.actors.S, { csv })).summary).toMatchObject({ create: 2, error: 0 });
    expect((await importShifts(w.actors.S, { csv, commit: true })).committed).toBe(true);
    expect((await importShifts(w.actors.S, { csv, commit: true })).summary).toMatchObject({ create: 0, unchanged: 2 });
    const bad = await importShifts(w.actors.S, { csv: "work_email,start,end\nnobody@example.test,2026-11-10 09:00,2026-11-10 17:00\n", commit: true });
    expect(bad.committed).toBe(false);
  });

  it("locking the period locks its shifts: no edits, no new shifts, no recalculation", async () => {
    await lockPeriod(w.actors.FIN, periodId);
    const october = await listShifts(w.actors.S, { from: "2026-10-01", to: "2026-10-31" });
    expect(october.every((s) => s.status === "locked")).toBe(true);
    await expect(updateShift(w.actors.S, october[0].id, { employeeId: october[0].employee.id, start: "2026-10-01 10:00", end: "2026-10-01 18:00" })).rejects.toBeInstanceOf(ConflictError);
    await expect(createShift(w.actors.S, { employeeId: w.people.U.id, start: "2026-10-20 09:00", end: "2026-10-20 10:00" })).rejects.toBeInstanceOf(ConflictError);
    await expect(calculatePeriod(w.actors.FIN, periodId)).rejects.toBeInstanceOf(ConflictError);
  });
});
