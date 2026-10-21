import { z } from "zod";
import { toIsoDate } from "@/lib/dates";
import { audit } from "@/server/audit";
import type { Actor } from "@/server/authz/actor";
import { assertGlobal, can } from "@/server/authz/policy";
import { prisma } from "@/server/db";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { balanceTypes, currentBalance, effectivePolicies, reverseUsage, round1, syncBalance, syncTypeBalance } from "@/server/absences/balance";

// Dictionary of absence types and accrual policies (PRD 5) — configured with settings.manage.

const typeInput = z.object({
  code: z.string().regex(/^[a-z][a-z0-9_]{1,40}$/),
  nameUk: z.string().trim().min(1).max(100),
  nameEn: z.string().trim().max(100).nullish(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  paid: z.boolean(),
  deductsBalance: z.boolean(),
  requiresDocument: z.boolean(),
  requiresApproval: z.boolean(),
  minDays: z.number().min(0.5).max(365).nullish(),
  maxDays: z.number().min(0.5).max(365).nullish(),
  allowHalfDay: z.boolean(),
  countsAsWorking: z.boolean().default(false),
});

const policyInput = z
  .object({
    name: z.string().trim().min(1).max(100),
    absenceTypeId: z.string().uuid(),
    isDefault: z.boolean().default(false),
    daysPerPeriod: z.number().min(0).max(366),
    accrual: z.enum(["upfront", "monthly"]),
    periodStart: z.enum(["hire_date", "jan_1", "month"]),
    expiry: z.enum(["end_of_period", "months_after", "never"]),
    expiryMonths: z.number().int().min(1).max(36).nullish(),
    carryoverMax: z.number().min(0).max(366).default(0),
    availableAfterDays: z.number().int().min(0).max(3650).default(0),
    allowNegative: z.boolean().default(false),
    countDays: z.enum(["working", "calendar"]).default("working"),
  })
  .refine((p) => p.expiry !== "months_after" || !!p.expiryMonths, { message: "expiryMonths required", path: ["expiryMonths"] });

const dec = (v: unknown) => (v == null ? null : Number(v));

/** Types, policies or assignments changed: every balance view re-syncs once (see getBalances). */
const resetBalanceSync = (tx: Pick<typeof prisma, "employee">) => tx.employee.updateMany({ where: { balancesSyncedOn: { not: null } }, data: { balancesSyncedOn: null } });

export async function listAbsenceTypes(_actor: Actor) {
  void _actor;
  const rows = await prisma.absenceType.findMany({ where: { deletedAt: null }, orderBy: { nameUk: "asc" } });
  return rows.map((t) => ({ ...t, minDays: dec(t.minDays), maxDays: dec(t.maxDays), createdAt: undefined, updatedAt: undefined }));
}

export async function upsertAbsenceType(actor: Actor, raw: unknown, id?: string) {
  assertGlobal(actor, "settings.manage");
  const input = typeInput.parse(raw);
  return prisma.$transaction(async (tx) => {
    const before = id ? await tx.absenceType.findFirst({ where: { id, deletedAt: null } }) : null;
    if (id && !before) throw new NotFoundError("absence type");
    if (await tx.absenceType.findFirst({ where: { code: input.code, id: id ? { not: id } : undefined } })) throw new ConflictError("code exists");
    const data = { ...input, nameEn: input.nameEn ?? null, minDays: input.minDays ?? null, maxDays: input.maxDays ?? null };
    const row = id ? await tx.absenceType.update({ where: { id }, data }) : await tx.absenceType.create({ data: { ...data, createdById: actor.userId } });
    await resetBalanceSync(tx);
    await audit(tx, actor, { action: id ? "absence_type.update" : "absence_type.create", entity: "AbsenceType", entityId: row.id, before, after: row });
    return { id: row.id };
  });
}

export async function listPolicies(actor: Actor) {
  assertGlobal(actor, "settings.manage");
  const rows = await prisma.absencePolicy.findMany({
    where: { deletedAt: null },
    include: {
      absenceType: { select: { id: true, code: true, nameUk: true, nameEn: true, color: true } },
      assignments: {
        include: {
          company: { select: { name: true, deletedAt: true } },
          department: { select: { name: true, deletedAt: true } },
          employee: { select: { firstName: true, lastName: true, deletedAt: true } },
        },
      },
    },
    orderBy: [{ absenceType: { createdAt: "asc" } }, { name: "asc" }],
  });
  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    absenceTypeId: p.absenceTypeId,
    absenceType: p.absenceType,
    isDefault: p.isDefault,
    daysPerPeriod: Number(p.daysPerPeriod),
    accrual: p.accrual,
    periodStart: p.periodStart,
    expiry: p.expiry,
    expiryMonths: p.expiryMonths,
    carryoverMax: Number(p.carryoverMax),
    availableAfterDays: p.availableAfterDays,
    allowNegative: p.allowNegative,
    countDays: p.countDays,
    companies: p.assignments.filter((a) => a.company && !a.company.deletedAt).map((a) => a.company!.name),
    departments: p.assignments.filter((a) => a.department && !a.department.deletedAt).map((a) => a.department!.name),
    employeeCount: p.assignments.filter((a) => a.employee && !a.employee.deletedAt).length,
  }));
}

/** Assignments of every target: {"company:<id>": {<typeId>: <policyId>}} — for the settings grid. */
export async function listPolicyAssignments(actor: Actor) {
  assertGlobal(actor, "settings.manage");
  const rows = await prisma.absencePolicyAssignment.findMany({ where: { employeeId: null } });
  const out: Record<string, Record<string, string>> = {};
  for (const a of rows) {
    const key = a.companyId ? `company:${a.companyId}` : `department:${a.departmentId}`;
    (out[key] ??= {})[a.absenceTypeId] = a.policyId;
  }
  return out;
}

export async function upsertPolicy(actor: Actor, raw: unknown, id?: string) {
  assertGlobal(actor, "settings.manage");
  const input = policyInput.parse(raw);
  return prisma.$transaction(async (tx) => {
    const before = id ? await tx.absencePolicy.findFirst({ where: { id, deletedAt: null } }) : null;
    if (id && !before) throw new NotFoundError("policy");
    if (before && before.absenceTypeId !== input.absenceTypeId) throw new ValidationError({ absenceTypeId: "cannot_change" });
    if (!(await tx.absenceType.findFirst({ where: { id: input.absenceTypeId, deletedAt: null } }))) throw new ValidationError({ absenceTypeId: "not_found" });
    if (await tx.absencePolicy.findFirst({ where: { name: input.name, id: id ? { not: id } : undefined } })) throw new ConflictError("policy name exists");
    const data = { ...input, expiryMonths: input.expiry === "months_after" ? input.expiryMonths! : null };
    // one default per type
    if (input.isDefault) await tx.absencePolicy.updateMany({ where: { absenceTypeId: input.absenceTypeId, isDefault: true, id: id ? { not: id } : undefined }, data: { isDefault: false } });
    const row = id ? await tx.absencePolicy.update({ where: { id }, data }) : await tx.absencePolicy.create({ data: { ...data, createdById: actor.userId } });
    await resetBalanceSync(tx);
    await audit(tx, actor, { action: id ? "absence_policy.update" : "absence_policy.create", entity: "AbsencePolicy", entityId: row.id, before, after: row });
    return { id: row.id };
  });
}

const assignInput = z.object({
  targetType: z.enum(["company", "department", "employee"]),
  targetId: z.string().uuid(),
  absenceTypeId: z.string().uuid(),
  policyId: z.string().uuid().nullable(),
});

/** Assigns (or clears) the policy of one type for a company, department or person; the most specific one wins. */
export async function assignPolicy(actor: Actor, raw: unknown) {
  assertGlobal(actor, "settings.manage");
  const input = assignInput.parse(raw);
  if (input.policyId && !(await prisma.absencePolicy.findFirst({ where: { id: input.policyId, absenceTypeId: input.absenceTypeId, deletedAt: null } }))) {
    throw new ValidationError({ policyId: "not_found" });
  }
  await prisma.$transaction(async (tx) => {
    const where = { id: input.targetId };
    const target =
      input.targetType === "company"
        ? await tx.company.findUniqueOrThrow({ where })
        : input.targetType === "department"
          ? await tx.department.findUniqueOrThrow({ where })
          : await tx.employee.findUniqueOrThrow({ where });
    const key = { absenceTypeId: input.absenceTypeId, [`${input.targetType}Id`]: input.targetId };
    const before = await tx.absencePolicyAssignment.findFirst({ where: key });
    if (before) await tx.absencePolicyAssignment.delete({ where: { id: before.id } });
    if (input.policyId) await tx.absencePolicyAssignment.create({ data: { ...key, policyId: input.policyId, createdById: actor.userId } });
    await resetBalanceSync(tx);
    await audit(tx, actor, {
      action: "absence_policy.assign",
      entity: input.targetType === "company" ? "Company" : input.targetType === "department" ? "Department" : "Employee",
      entityId: input.targetId,
      before: { absenceTypeId: input.absenceTypeId, policyId: before?.policyId ?? null },
      after: { absenceTypeId: input.absenceTypeId, policyId: input.policyId },
      employeeId: input.targetType === "employee" ? input.targetId : null,
      departmentId: input.targetType === "department" ? input.targetId : "departmentId" in target ? (target as { departmentId: string }).departmentId : null,
    });
  });
}

// ───────────── balance & absences of one person ─────────────

async function personInScope(actor: Actor, employeeId: string) {
  const e = await prisma.employee.findFirst({ where: { id: employeeId, deletedAt: null } });
  if (!e || !can(actor, "employees.view", { employeeId: e.id, departmentId: e.departmentId })) throw new NotFoundError("employee");
  return e;
}

/**
 * Balances per absence type with the ledger — visible to whoever sees the full profile (own, department, all).
 * Contractors have no PTO (policy): `eligible: false`, no balances.
 */
export async function getBalances(actor: Actor, employeeId: string) {
  const e = await personInScope(actor, employeeId);
  const now = new Date();
  // accruals and expiries are booked at most once a day per person; anything that changes policies resets the mark
  if (toIsoDate(e.balancesSyncedOn) !== toIsoDate(now)) await prisma.$transaction((tx) => syncBalance(tx, employeeId, now), { timeout: 30_000 });
  const [types, policies, rows] = await Promise.all([
    balanceTypes(prisma),
    effectivePolicies(prisma, employeeId),
    prisma.absenceBalance.findMany({
      where: { employeeId },
      select: { absenceTypeId: true, policyId: true, periodStart: true, periodEnd: true, entries: { select: { amount: true } } },
      orderBy: { periodStart: "desc" },
    }),
  ]);
  const balances = types.map((type) => {
    const policy = policies.get(type.id) ?? null;
    const current = policy ? rows.find((r) => r.policyId === policy.id && r.periodStart <= now) : null;
    const balance = round1(rows.filter((r) => r.absenceTypeId === type.id).reduce((s, r) => s + r.entries.reduce((x, y) => x + Number(y.amount), 0), 0));
    return {
      type: { id: type.id, code: type.code, nameUk: type.nameUk, nameEn: type.nameEn, color: type.color, countsAsWorking: type.countsAsWorking },
      policy: policy ? { id: policy.id, name: policy.name, countDays: policy.countDays, periodStart: policy.periodStart, daysPerPeriod: Number(policy.daysPerPeriod) } : null,
      balance,
      period: current ? { start: toIsoDate(current.periodStart)!, end: toIsoDate(current.periodEnd)! } : null,
    };
  });
  const [entries, absences] = await Promise.all([
    prisma.absenceLedgerEntry.findMany({
      where: { balance: { employeeId } },
      include: {
        balance: { select: { periodStart: true, periodEnd: true, absenceType: { select: { nameUk: true, nameEn: true, color: true } } } },
        absence: { select: { startDate: true, endDate: true } },
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 200,
    }),
    prisma.absence.findMany({ where: { employeeId }, include: { type: true }, orderBy: { startDate: "desc" }, take: 100 }),
  ]);
  return {
    eligible: e.employmentType !== "contractor",
    balances: e.employmentType === "contractor" ? [] : balances.filter((b) => b.policy || b.balance !== 0),
    entries: entries.map((x) => ({
      id: x.id,
      type: x.type,
      amount: Number(x.amount),
      date: toIsoDate(x.date)!,
      comment: x.comment,
      absenceType: x.balance.absenceType,
      period: { start: toIsoDate(x.balance.periodStart)!, end: toIsoDate(x.balance.periodEnd)! },
      absence: x.absence ? { from: toIsoDate(x.absence.startDate)!, to: toIsoDate(x.absence.endDate)! } : null,
    })),
    absences: absences.map((a) => ({
      id: a.id,
      type: { nameUk: a.type.nameUk, nameEn: a.type.nameEn, color: a.type.color },
      from: toIsoDate(a.startDate)!,
      to: toIsoDate(a.endDate)!,
      days: Number(a.days),
      halfDay: a.halfDay,
      status: a.status,
      requestId: a.requestId,
    })),
  };
}

const adjustInput = z.object({
  absenceTypeId: z.string().uuid(),
  amount: z.number().refine((v) => v !== 0).refine((v) => Math.abs(v) <= 366),
  comment: z.string().trim().min(1).max(500),
});

/** Manual correction of one type's balance — only with balances.adjust (PRD 5: superadmin), always with a comment and an audit record. */
export async function adjustBalance(actor: Actor, employeeId: string, raw: unknown) {
  assertGlobal(actor, "balances.adjust");
  const input = adjustInput.parse(raw);
  const e = await prisma.employee.findFirst({ where: { id: employeeId, deletedAt: null } });
  if (!e) throw new NotFoundError("employee");
  return prisma.$transaction(async (tx) => {
    const { policy } = await syncTypeBalance(tx, employeeId, input.absenceTypeId);
    if (!policy) throw new ValidationError({ absenceTypeId: e.employmentType === "contractor" ? "not_eligible" : "no_absence_policy" });
    const today = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
    const balance =
      (await tx.absenceBalance.findFirst({ where: { employeeId, policyId: policy.id, periodStart: { lte: today } }, orderBy: { periodStart: "desc" } })) ??
      (await tx.absenceBalance.create({ data: { employeeId, policyId: policy.id, absenceTypeId: input.absenceTypeId, periodStart: today, periodEnd: today } }));
    const row = await tx.absenceLedgerEntry.create({
      data: { balanceId: balance.id, type: "manual_adjustment", amount: round1(input.amount), date: today, comment: input.comment, createdById: actor.userId },
    });
    await audit(tx, actor, {
      action: "balance.adjust",
      entity: "AbsenceLedgerEntry",
      entityId: row.id,
      after: { absenceTypeId: input.absenceTypeId, amount: input.amount, comment: input.comment },
      departmentId: e.departmentId,
      employeeId,
    });
    return { balance: await currentBalance(tx, employeeId, input.absenceTypeId) };
  });
}

/** Cancels an approved absence and gives the days back (balances.adjust). */
export async function cancelAbsence(actor: Actor, absenceId: string) {
  assertGlobal(actor, "balances.adjust");
  const a = await prisma.absence.findUnique({ where: { id: absenceId }, include: { employee: true } });
  if (!a || a.status !== "approved") throw new NotFoundError("absence");
  await prisma.$transaction(async (tx) => {
    await tx.absence.update({ where: { id: absenceId }, data: { status: "cancelled" } });
    await reverseUsage(tx, absenceId);
    await audit(tx, actor, {
      action: "absence.cancel",
      entity: "Absence",
      entityId: absenceId,
      before: { status: a.status },
      after: { status: "cancelled" },
      departmentId: a.employee.departmentId,
      employeeId: a.employeeId,
    });
  });
}

/** Daily job body (decision 11): accruals, carryovers and expiries for everyone, idempotent. */
export async function runDailyBalances(now = new Date()) {
  const people = await prisma.employee.findMany({ where: { deletedAt: null, status: { in: ["onboarding", "active", "offboarding"] }, hireDate: { not: null } }, select: { id: true } });
  let booked = 0;
  for (const p of people) {
    const r = await prisma.$transaction((tx) => syncBalance(tx, p.id, now), { timeout: 30_000 });
    booked += r.booked;
  }
  return { employees: people.length, booked };
}
