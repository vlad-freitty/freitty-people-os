/** Phase 6 acceptance: PTO per type, days since the last absence of a type, two approvals (docs/phase-6-plan.md). */
import { beforeEach, describe, expect, it } from "vitest";
import { parseIsoDate } from "@/lib/dates";
import { prisma } from "@/server/db";
import { currentBalance, syncBalance } from "@/server/absences/balance";
import { actOnStep, startRequest } from "@/server/requests/engine";
import { getBalances } from "@/server/services/absences";
import { previewMyAbsence, requestAbsenceInsight } from "@/server/services/requests";
import { DEFAULT_PTO_POLICIES, ensureAbsenceTypes, ensurePtoPolicies } from "@/server/seed/calendar";
import { activeSteps, buildEngineWorld } from "./engine-world";
import { actorFor } from "./helpers";

type World = Awaited<ReturnType<typeof buildEngineWorld>>;
let w: World;
let types: Record<string, string>;

const at = (iso: string) => new Date(`${iso}T09:00:00Z`);

beforeEach(async () => {
  w = await buildEngineWorld();
  await ensureAbsenceTypes(prisma);
  await ensurePtoPolicies(prisma);
  types = Object.fromEntries((await prisma.absenceType.findMany()).map((t) => [t.code, t.id]));
  // U is a contractor in the base world — make everyone a regular employee here; one test turns U back
  await prisma.employee.updateMany({ data: { hireDate: parseIsoDate("2024-01-15"), employmentType: "employee" } });
});

/** Drives an absence request of U through both approvals. */
async function approvedAbsence(type: string, from: string, to: string) {
  const user = await actorFor(w.people.U);
  const { id } = await startRequest(user, { requestTypeId: w.templates.absence, values: { absence_type: types[type], dates: { from, to } } });
  for (const s of await activeSteps(id)) {
    const actor = s.assigneeId === w.people.H.id ? w.actors.H : w.actors.C;
    await actOnStep(actor, s.id, { action: "approve" });
  }
  return id;
}

describe("one balance per type", () => {
  it("every PTO type has its own default policy and balance", async () => {
    const { U } = w.people;
    const b = await getBalances(await actorFor(U), U.id);
    expect(b.eligible).toBe(true);
    const byCode = Object.fromEntries(b.balances.map((x) => [x.type.code, x.balance]));
    expect(byCode).toMatchObject({
      vacation: DEFAULT_PTO_POLICIES.vacation.daysPerPeriod,
      wellness_day: 1,
      remote_day: 1,
      sick_leave: 2,
      unpaid: 5,
    });
    expect(byCode).not.toHaveProperty("specific_reason"); // no balance: up to 3 days per case
  });

  it("using one type leaves the others untouched", async () => {
    const { U } = w.people;
    await approvedAbsence("wellness_day", "2026-11-04", "2026-11-04");
    await syncBalance(prisma, U.id);
    expect(await currentBalance(prisma, U.id, types.wellness_day)).toBe(0);
    expect(await currentBalance(prisma, U.id, types.vacation)).toBe(10);
  });

  it("Remote Days are per calendar month and the unused one burns at the end of the month", async () => {
    const { P } = w.people;
    await syncBalance(prisma, P.id, at("2026-10-20"));
    expect(await currentBalance(prisma, P.id, types.remote_day)).toBe(1);
    await syncBalance(prisma, P.id, at("2026-11-01"));
    expect(await currentBalance(prisma, P.id, types.remote_day)).toBe(1); // October's day expired, November's arrived
    const ledger = await prisma.absenceLedgerEntry.findMany({ where: { balance: { employeeId: P.id, absenceTypeId: types.remote_day } } });
    expect(ledger.map((e) => `${e.type}:${Number(e.amount)}`).sort()).toEqual(["accrual:1", "accrual:1", "expiry:-1"]);
    // years of past months are not created one by one
    expect(await prisma.absenceBalance.count({ where: { employeeId: P.id, absenceTypeId: types.remote_day } })).toBe(2);
  });

  it("a Remote Day is a working day: not in the team's 'absent today'", async () => {
    await approvedAbsence("remote_day", "2026-11-04", "2026-11-04");
    const remote = await prisma.absence.findFirstOrThrow({ include: { type: true } });
    expect(remote.type.countsAsWorking).toBe(true);
  });

  it("contractors have no PTO: no balance, the absence is only recorded", async () => {
    const { U } = w.people;
    await prisma.employee.update({ where: { id: U.id }, data: { employmentType: "contractor" } });
    const b = await getBalances(await actorFor(U), U.id);
    expect(b).toMatchObject({ eligible: false, balances: [] });
    const id = await approvedAbsence("vacation", "2026-11-04", "2026-11-05");
    expect((await prisma.request.findUniqueOrThrow({ where: { id } })).status).toBe("done");
    expect(await prisma.absence.count({ where: { employeeId: U.id } })).toBe(1);
    expect(await prisma.absenceLedgerEntry.count({ where: { balance: { employeeId: U.id } } })).toBe(0);
  });
});

describe("days since the last absence of the same type", () => {
  it("counts from the last approved absence of that type only", async () => {
    await approvedAbsence("vacation", "2026-06-15", "2026-06-19");
    await approvedAbsence("sick_leave", "2026-09-01", "2026-09-02"); // another type in between does not matter
    const user = await actorFor(w.people.U);
    const { id } = await startRequest(user, { requestTypeId: w.templates.absence, values: { absence_type: types.vacation, dates: { from: "2026-11-02", to: "2026-11-06" } } });
    const insight = await requestAbsenceInsight(w.actors.H, id);
    expect(insight?.last).toEqual({ from: "2026-06-15", to: "2026-06-19", daysSince: 136 });
    expect(insight?.balance).toBe(5);

    const preview = await previewMyAbsence(user, { absence_type: types.sick_leave, dates: { from: "2026-11-09", to: "2026-11-09" } });
    expect(preview?.last).toMatchObject({ from: "2026-09-01", to: "2026-09-02" });
    const first = await previewMyAbsence(user, { absence_type: types.wellness_day, dates: { from: "2026-11-09", to: "2026-11-09" } });
    expect(first?.last).toBeNull();
  });

  it("policy rules are warnings for the approvers, never blocks", async () => {
    const user = await actorFor(w.people.U);
    await prisma.employee.update({ where: { id: w.people.U.id }, data: { hireDate: parseIsoDate("2026-06-01") } }); // < 1 year
    const { id } = await startRequest(user, { requestTypeId: w.templates.absence, values: { absence_type: types.vacation, dates: { from: "2026-11-02", to: "2026-11-27" } } });
    const insight = await requestAbsenceInsight(w.actors.H, id);
    expect(insight?.warnings.map((x) => x.code).sort()).toEqual(["available_from", "not_enough_balance"]);
  });
});

describe("approval by the direct manager and Head of People — two different people", () => {
  it("the direct manager from the profile approves, Head of People is a role", async () => {
    const { U, E } = w.people;
    const hop = await prisma.role.findUniqueOrThrow({ where: { code: "head_of_people" } });
    await prisma.user.update({ where: { id: w.people.HR.userId! }, data: { roleId: hop.id } });
    await prisma.employee.update({ where: { id: U.id }, data: { managerId: E.id } });
    const { id } = await startRequest(await actorFor(U), { requestTypeId: w.templates.absence, values: { absence_type: types.vacation, dates: { from: "2026-11-04", to: "2026-11-05" } } });
    expect((await activeSteps(id)).map((s) => s.assigneeId)).toEqual([E.id, w.people.HR.id]);
  });

  it("when the manager is the only Head of People, the second approval goes to the CEO", async () => {
    const { U, E } = w.people;
    const hop = await prisma.role.findUniqueOrThrow({ where: { code: "head_of_people" } });
    await prisma.user.update({ where: { id: E.userId! }, data: { roleId: hop.id } });
    await prisma.employee.update({ where: { id: U.id }, data: { managerId: E.id } });
    const { id } = await startRequest(await actorFor(U), { requestTypeId: w.templates.absence, values: { absence_type: types.vacation, dates: { from: "2026-11-04", to: "2026-11-05" } } });
    expect((await activeSteps(id)).map((s) => s.assigneeId)).toEqual([E.id, w.people.C.id]);
  });

  it("Head of People never approves their own absence", async () => {
    const { HR } = w.people;
    const hop = await prisma.role.findUniqueOrThrow({ where: { code: "head_of_people" } });
    await prisma.user.update({ where: { id: HR.userId! }, data: { roleId: hop.id } });
    const { id } = await startRequest(await actorFor(HR), { requestTypeId: w.templates.absence, values: { absence_type: types.vacation, dates: { from: "2026-11-04", to: "2026-11-05" } } });
    const steps = await activeSteps(id);
    expect(steps.map((s) => s.assigneeId)).not.toContain(HR.id);
    expect(steps[1].assigneeId).toBe(w.people.C.id);
  });
});
