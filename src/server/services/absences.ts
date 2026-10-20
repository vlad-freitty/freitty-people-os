import { z } from "zod";
import { toIsoDate } from "@/lib/dates";
import { audit } from "@/server/audit";
import type { Actor } from "@/server/authz/actor";
import { assertGlobal, can } from "@/server/authz/policy";
import { prisma } from "@/server/db";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { currentBalance, effectivePolicy, reverseUsage, round1, syncBalance } from "@/server/absences/balance";

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
});

const policyInput = z
  .object({
    name: z.string().trim().min(1).max(100),
    daysPerPeriod: z.number().min(0).max(366),
    accrual: z.enum(["upfront", "monthly"]),
    periodStart: z.enum(["hire_date", "jan_1"]),
    expiry: z.enum(["end_of_period", "months_after", "never"]),
    expiryMonths: z.number().int().min(1).max(36).nullish(),
    carryoverMax: z.number().min(0).max(366).default(0),
    availableAfterDays: z.number().int().min(0).max(3650).default(0),
    allowNegative: z.boolean().default(false),
    countDays: z.enum(["working", "calendar"]).default("working"),
  })
  .refine((p) => p.expiry !== "months_after" || !!p.expiryMonths, { message: "expiryMonths required", path: ["expiryMonths"] });

const dec = (v: unknown) => (v == null ? null : Number(v));

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
    await audit(tx, actor, { action: id ? "absence_type.update" : "absence_type.create", entity: "AbsenceType", entityId: row.id, before, after: row });
    return { id: row.id };
  });
}

export async function listPolicies(actor: Actor) {
  assertGlobal(actor, "settings.manage");
  const rows = await prisma.absencePolicy.findMany({
    where: { deletedAt: null },
    include: {
      companies: { where: { deletedAt: null }, select: { id: true, name: true } },
      departments: { where: { deletedAt: null }, select: { id: true, name: true } },
      _count: { select: { employees: { where: { deletedAt: null } } } },
    },
    orderBy: { name: "asc" },
  });
  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    daysPerPeriod: Number(p.daysPerPeriod),
    accrual: p.accrual,
    periodStart: p.periodStart,
    expiry: p.expiry,
    expiryMonths: p.expiryMonths,
    carryoverMax: Number(p.carryoverMax),
    availableAfterDays: p.availableAfterDays,
    allowNegative: p.allowNegative,
    countDays: p.countDays,
    companies: p.companies,
    departments: p.departments,
    employeeCount: p._count.employees,
  }));
}

export async function upsertPolicy(actor: Actor, raw: unknown, id?: string) {
  assertGlobal(actor, "settings.manage");
  const input = policyInput.parse(raw);
  return prisma.$transaction(async (tx) => {
    const before = id ? await tx.absencePolicy.findFirst({ where: { id, deletedAt: null } }) : null;
    if (id && !before) throw new NotFoundError("policy");
    if (await tx.absencePolicy.findFirst({ where: { name: input.name, id: id ? { not: id } : undefined } })) throw new ConflictError("policy name exists");
    const data = { ...input, expiryMonths: input.expiry === "months_after" ? input.expiryMonths! : null };
    const row = id ? await tx.absencePolicy.update({ where: { id }, data }) : await tx.absencePolicy.create({ data: { ...data, createdById: actor.userId } });
    await audit(tx, actor, { action: id ? "absence_policy.update" : "absence_policy.create", entity: "AbsencePolicy", entityId: row.id, before, after: row });
    return { id: row.id };
  });
}

const assignInput = z.object({
  targetType: z.enum(["company", "department", "employee"]),
  targetId: z.string().uuid(),
  policyId: z.string().uuid().nullable(),
});

/** Assigns (or clears) the policy of a company, department or person; the most specific one wins. */
export async function assignPolicy(actor: Actor, raw: unknown) {
  assertGlobal(actor, "settings.manage");
  const input = assignInput.parse(raw);
  if (input.policyId && !(await prisma.absencePolicy.findFirst({ where: { id: input.policyId, deletedAt: null } }))) {
    throw new ValidationError({ policyId: "not_found" });
  }
  await prisma.$transaction(async (tx) => {
    const data = { absencePolicyId: input.policyId };
    const where = { id: input.targetId };
    const before =
      input.targetType === "company"
        ? await tx.company.findUniqueOrThrow({ where })
        : input.targetType === "department"
          ? await tx.department.findUniqueOrThrow({ where })
          : await tx.employee.findUniqueOrThrow({ where });
    if (input.targetType === "company") await tx.company.update({ where, data });
    else if (input.targetType === "department") await tx.department.update({ where, data });
    else await tx.employee.update({ where, data });
    await audit(tx, actor, {
      action: "absence_policy.assign",
      entity: input.targetType === "company" ? "Company" : input.targetType === "department" ? "Department" : "Employee",
      entityId: input.targetId,
      before: { absencePolicyId: before.absencePolicyId },
      after: data,
      employeeId: input.targetType === "employee" ? input.targetId : null,
      departmentId: input.targetType === "department" ? input.targetId : "departmentId" in before ? (before as { departmentId: string }).departmentId : null,
    });
  });
}

// ───────────── balance & absences of one person ─────────────

async function personInScope(actor: Actor, employeeId: string) {
  const e = await prisma.employee.findFirst({ where: { id: employeeId, deletedAt: null } });
  if (!e || !can(actor, "employees.view", { employeeId: e.id, departmentId: e.departmentId })) throw new NotFoundError("employee");
  return e;
}

/** Balance with its ledger — visible to whoever sees the full profile (own, department, all). */
export async function getBalance(actor: Actor, employeeId: string) {
  await personInScope(actor, employeeId);
  const policy = await prisma.$transaction((tx) => syncBalance(tx, employeeId).then((r) => r.policy), { timeout: 30_000 });
  const [balance, entries, absences, assigned] = await Promise.all([
    currentBalance(prisma, employeeId),
    prisma.absenceLedgerEntry.findMany({
      where: { balance: { employeeId } },
      include: { balance: { select: { periodStart: true, periodEnd: true } }, absence: { select: { startDate: true, endDate: true } } },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 200,
    }),
    prisma.absence.findMany({ where: { employeeId }, include: { type: true }, orderBy: { startDate: "desc" }, take: 100 }),
    effectivePolicy(prisma, employeeId),
  ]);
  return {
    policy: (policy ?? assigned) ? { id: (policy ?? assigned)!.id, name: (policy ?? assigned)!.name, countDays: (policy ?? assigned)!.countDays } : null,
    balance,
    entries: entries.map((x) => ({
      id: x.id,
      type: x.type,
      amount: Number(x.amount),
      date: toIsoDate(x.date)!,
      comment: x.comment,
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

const adjustInput = z.object({ amount: z.number().refine((v) => v !== 0).refine((v) => Math.abs(v) <= 366), comment: z.string().trim().min(1).max(500) });

/** Manual correction — only with balances.adjust (PRD 5: superadmin), always with a comment and an audit record. */
export async function adjustBalance(actor: Actor, employeeId: string, raw: unknown) {
  assertGlobal(actor, "balances.adjust");
  const input = adjustInput.parse(raw);
  const e = await prisma.employee.findFirst({ where: { id: employeeId, deletedAt: null } });
  if (!e) throw new NotFoundError("employee");
  return prisma.$transaction(async (tx) => {
    const { policy } = await syncBalance(tx, employeeId);
    if (!policy) throw new ValidationError({ policy: "no_absence_policy" });
    const balance =
      (await tx.absenceBalance.findFirst({ where: { employeeId, policyId: policy.id }, orderBy: { periodStart: "desc" } })) ??
      (await tx.absenceBalance.create({ data: { employeeId, policyId: policy.id, periodStart: new Date(), periodEnd: new Date() } }));
    const today = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
    const row = await tx.absenceLedgerEntry.create({
      data: { balanceId: balance.id, type: "manual_adjustment", amount: round1(input.amount), date: today, comment: input.comment, createdById: actor.userId },
    });
    await audit(tx, actor, {
      action: "balance.adjust",
      entity: "AbsenceLedgerEntry",
      entityId: row.id,
      after: { amount: input.amount, comment: input.comment },
      departmentId: e.departmentId,
      employeeId,
    });
    return { balance: await currentBalance(tx, employeeId) };
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
