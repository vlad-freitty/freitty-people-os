import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { isIsoDate, parseIsoDate, toIsoDate } from "@/lib/dates";
import { audit } from "@/server/audit";
import type { Actor } from "@/server/authz/actor";
import { assertGlobal, employeeScopeWhere, scopeOf } from "@/server/authz/policy";
import { prisma, type Tx } from "@/server/db";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { draftPayments, round2, sumLines } from "@/server/money/calc";

/**
 * Payment periods and payments (PRD 6). The system calculates and tracks statuses; it never moves money.
 * Statuses: calculated → documents_received → approved → paid. Contractors cannot be approved without an act
 * or invoice for the period (decision 8). Amounts are never edited by hand — corrections are adjustment lines.
 */

const EDITABLE = ["calculated", "documents_received"] as const;

const periodInput = z
  .object({ companyId: z.string().uuid(), periodStart: z.string().refine(isIsoDate), periodEnd: z.string().refine(isIsoDate) })
  .refine((p) => p.periodStart <= p.periodEnd, { message: "end before start", path: ["periodEnd"] });

export async function listPeriods(actor: Actor, raw: unknown = {}) {
  assertGlobal(actor, "payments.manage");
  const { companyId } = z.object({ companyId: z.string().uuid().optional() }).parse(raw);
  const rows = await prisma.paymentPeriod.findMany({
    where: companyId ? { companyId } : {},
    include: { company: { select: { name: true } }, payments: { select: { status: true, total: true, currency: true } } },
    orderBy: [{ periodStart: "desc" }, { company: { name: "asc" } }],
  });
  return rows.map((p) => {
    const totals = new Map<string, number>();
    for (const pay of p.payments) totals.set(pay.currency, round2((totals.get(pay.currency) ?? 0) + Number(pay.total)));
    return {
      id: p.id,
      company: { id: p.companyId, name: p.company.name },
      periodStart: toIsoDate(p.periodStart)!,
      periodEnd: toIsoDate(p.periodEnd)!,
      status: p.status,
      paymentCount: p.payments.length,
      byStatus: Object.fromEntries(["calculated", "documents_received", "approved", "paid"].map((s) => [s, p.payments.filter((x) => x.status === s).length])),
      totals: [...totals].map(([currency, total]) => ({ currency, total: total.toFixed(2) })),
    };
  });
}

export async function createPeriod(actor: Actor, raw: unknown) {
  assertGlobal(actor, "payments.manage");
  const input = periodInput.parse(raw);
  const start = parseIsoDate(input.periodStart);
  const end = parseIsoDate(input.periodEnd);
  const overlap = await prisma.paymentPeriod.findFirst({ where: { companyId: input.companyId, periodStart: { lte: end }, periodEnd: { gte: start } } });
  if (overlap) throw new ConflictError("the period overlaps another period of this company");
  return prisma.$transaction(async (tx) => {
    const row = await tx.paymentPeriod.create({ data: { companyId: input.companyId, periodStart: start, periodEnd: end, createdById: actor.userId } });
    await audit(tx, actor, { action: "period.create", entity: "PaymentPeriod", entityId: row.id, after: input });
    return { id: row.id };
  });
}

/** (Re)calculates a period. Adjustments are kept; approved and paid payments are never touched. */
export async function calculatePeriod(actor: Actor, periodId: string) {
  assertGlobal(actor, "payments.manage");
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "payment_period" WHERE "id" = ${periodId}::uuid FOR UPDATE`;
      const period = await tx.paymentPeriod.findUnique({ where: { id: periodId } });
      if (!period) throw new NotFoundError("period");
      if (period.status === "locked") throw new ConflictError("the period is locked");

      const { payments: drafts, warnings } = await draftPayments(tx, period);
      const existing = await tx.payment.findMany({ where: { periodId }, include: { lines: true } });
      const frozen = new Set(existing.filter((p) => !(EDITABLE as readonly string[]).includes(p.status)).map((p) => `${p.employeeId}:${p.currency}`));
      let written = 0;

      for (const d of drafts) {
        const key = `${d.employeeId}:${d.currency}`;
        if (frozen.has(key)) continue;
        const payment =
          existing.find((p) => p.employeeId === d.employeeId && p.currency === d.currency) ??
          (await tx.payment.create({ data: { periodId, employeeId: d.employeeId, currency: d.currency, total: 0 }, include: { lines: true } }));
        await rebuild(tx, actor, payment.id, d.lines);
        written++;
      }
      // editable payments that have nothing left to pay (e.g. a shift was removed) disappear unless adjusted by hand
      for (const p of existing) {
        if (!(EDITABLE as readonly string[]).includes(p.status)) continue;
        if (drafts.some((d) => d.employeeId === p.employeeId && d.currency === p.currency)) continue;
        if (p.lines.some((l) => l.kind === "adjustment")) await rebuild(tx, actor, p.id, []);
        else {
          await tx.bonus.updateMany({ where: { paymentId: p.id }, data: { status: "approved", paymentId: null } });
          await tx.payment.delete({ where: { id: p.id } });
        }
      }
      await tx.paymentPeriod.update({ where: { id: periodId }, data: { status: "calculated" } });
      await audit(tx, actor, { action: "period.calculate", entity: "PaymentPeriod", entityId: periodId, after: { payments: written, warnings: warnings.length } });
      return { payments: written, warnings };
    },
    { timeout: 120_000 },
  );
}

async function rebuild(tx: Tx, actor: Actor, paymentId: string, lines: { kind: "shifts" | "monthly_rate" | "bonus" | "adjustment"; amount: number; description: string; sourceIds: string[] }[]) {
  await tx.bonus.updateMany({ where: { paymentId }, data: { status: "approved", paymentId: null } });
  await tx.paymentLine.deleteMany({ where: { paymentId, kind: { not: "adjustment" } } });
  if (lines.length) await tx.paymentLine.createMany({ data: lines.map((l) => ({ ...l, paymentId, createdById: actor.userId })) });
  const bonusIds = lines.filter((l) => l.kind === "bonus").flatMap((l) => l.sourceIds);
  if (bonusIds.length) await tx.bonus.updateMany({ where: { id: { in: bonusIds } }, data: { status: "included", paymentId } });
  const all = await tx.paymentLine.findMany({ where: { paymentId } });
  await tx.payment.update({ where: { id: paymentId }, data: { total: sumLines(all) } });
}

// ───────────── reading ─────────────

const paymentInclude = {
  employee: { select: { id: true, firstName: true, lastName: true, employmentType: true, departmentId: true, department: { select: { name: true } } } },
  period: { include: { company: { select: { name: true } } } },
  lines: { orderBy: { createdAt: "asc" } },
} satisfies Prisma.PaymentInclude;
type PaymentRow = Prisma.PaymentGetPayload<{ include: typeof paymentInclude }>;

function periodLabel(p: { periodStart: Date }) {
  return toIsoDate(p.periodStart)!.slice(0, 7);
}

/** Has the contractor an act or invoice covering the period (decision 8)? */
export async function hasPeriodDocument(tx: Tx, employeeId: string, period: { periodStart: Date; periodEnd: Date }) {
  const doc = await tx.document.findFirst({
    where: {
      employeeId,
      deletedAt: null,
      type: { in: ["act", "invoice"] },
      status: { not: "archived" },
      OR: [{ period: periodLabel(period) }, { validFrom: { lte: period.periodEnd }, validTo: { gte: period.periodStart } }],
    },
    select: { id: true },
  });
  return !!doc;
}

async function toDto(p: PaymentRow) {
  const documentOk = p.employee.employmentType !== "contractor" || (await hasPeriodDocument(prisma, p.employeeId, p.period));
  return {
    id: p.id,
    employee: { id: p.employee.id, name: `${p.employee.firstName} ${p.employee.lastName}`, employmentType: p.employee.employmentType, department: p.employee.department.name },
    period: { id: p.periodId, label: periodLabel(p.period), status: p.period.status, company: p.period.company.name, start: toIsoDate(p.period.periodStart)!, end: toIsoDate(p.period.periodEnd)! },
    currency: p.currency,
    total: Number(p.total).toFixed(2),
    status: p.status,
    paidAt: p.paidAt?.toISOString() ?? null,
    paymentRef: p.paymentRef,
    approvedAt: p.approvedAt?.toISOString() ?? null,
    documentOk,
    lines: p.lines.map((l) => ({ id: l.id, kind: l.kind, amount: Number(l.amount).toFixed(2), description: l.description, sourceCount: l.sourceIds.length })),
  };
}

const listQuery = z.object({
  periodId: z.string().uuid().optional(),
  employeeId: z.string().uuid().optional(),
  filter: z.enum(["waiting_documents", "waiting_approval", "unpaid"]).optional(),
  days: z.coerce.number().int().min(0).max(365).default(14),
});

/**
 * Monitoring (PRD 6): finance sees everything; others see payments they may see as sensitive data (own, department).
 * Filters: waiting for documents, waiting for approval, not paid N days after the period ended.
 */
export async function listPayments(actor: Actor, raw: unknown = {}) {
  const q = listQuery.parse(raw);
  const manage = scopeOf(actor, "payments.manage") === "all";
  const people = employeeScopeWhere(actor, "employees.view_sensitive");
  if (!manage && !people) return [];
  const where: Prisma.PaymentWhereInput = {
    AND: [
      manage ? {} : { employee: people! },
      q.periodId ? { periodId: q.periodId } : {},
      q.employeeId ? { employeeId: q.employeeId } : {},
      q.filter === "waiting_approval" ? { status: { in: ["calculated", "documents_received"] } } : {},
      q.filter === "waiting_documents" ? { status: "calculated", employee: { employmentType: "contractor" } } : {},
      q.filter === "unpaid" ? { status: { not: "paid" }, period: { periodEnd: { lt: new Date(Date.now() - q.days * 86_400_000) } } } : {},
    ],
  };
  const rows = await prisma.payment.findMany({ where, include: paymentInclude, orderBy: [{ period: { periodStart: "desc" } }, { employee: { lastName: "asc" } }], take: 1000 });
  const dtos = await Promise.all(rows.map(toDto));
  if (q.filter === "waiting_documents") return dtos.filter((d) => !d.documentOk);
  if (q.filter === "waiting_approval") return dtos.filter((d) => d.documentOk);
  return dtos;
}

// ───────────── statuses & adjustments ─────────────

async function loadForChange(tx: Tx, actor: Actor, paymentId: string) {
  assertGlobal(actor, "payments.manage");
  await tx.$queryRaw`SELECT "id" FROM "payment" WHERE "id" = ${paymentId}::uuid FOR UPDATE`;
  const p = await tx.payment.findUnique({ where: { id: paymentId }, include: paymentInclude });
  if (!p) throw new NotFoundError("payment");
  return p;
}

const statusInput = z.discriminatedUnion("status", [
  z.object({ status: z.literal("documents_received") }),
  z.object({ status: z.literal("approved") }),
  z.object({ status: z.literal("paid"), paymentRef: z.string().trim().min(1).max(200), paidAt: z.string().datetime().optional() }),
]);

const NEXT: Record<string, string[]> = { calculated: ["documents_received", "approved"], documents_received: ["approved"], approved: ["paid"], paid: [] };

export async function setPaymentStatus(actor: Actor, paymentId: string, raw: unknown) {
  const input = statusInput.parse(raw);
  return prisma.$transaction(async (tx) => {
    const p = await loadForChange(tx, actor, paymentId);
    if (!NEXT[p.status].includes(input.status)) throw new ConflictError(`cannot go from ${p.status} to ${input.status}`);
    if (input.status === "approved" && p.employee.employmentType === "contractor" && !(await hasPeriodDocument(tx, p.employeeId, p.period))) {
      throw new ValidationError({ status: "contractor_needs_act_or_invoice" });
    }
    const data: Prisma.PaymentUpdateInput =
      input.status === "approved"
        ? { status: "approved", approvedById: actor.userId, approvedAt: new Date() }
        : input.status === "paid"
          ? { status: "paid", paymentRef: input.paymentRef, paidAt: input.paidAt ? new Date(input.paidAt) : new Date() }
          : { status: input.status };
    await tx.payment.update({ where: { id: paymentId }, data });
    if (input.status === "paid") await tx.bonus.updateMany({ where: { paymentId }, data: { status: "paid" } });
    await audit(tx, actor, {
      action: `payment.${input.status}`,
      entity: "Payment",
      entityId: paymentId,
      before: { status: p.status },
      after: data,
      departmentId: p.employee.departmentId,
      employeeId: p.employeeId,
    });
  });
}

const adjustmentInput = z.object({ amount: z.number().refine((v) => v !== 0 && Math.abs(v) <= 10_000_000), comment: z.string().trim().min(1).max(500) });

/** Corrections are separate lines with a mandatory comment — the calculated sums are never edited (PRD 6). */
export async function addAdjustment(actor: Actor, paymentId: string, raw: unknown) {
  const input = adjustmentInput.parse(raw);
  return prisma.$transaction(async (tx) => {
    const p = await loadForChange(tx, actor, paymentId);
    if (!(EDITABLE as readonly string[]).includes(p.status)) throw new ConflictError("approved or paid payments cannot be adjusted");
    if (p.period.status === "locked") throw new ConflictError("the period is locked");
    const line = await tx.paymentLine.create({ data: { paymentId, kind: "adjustment", amount: round2(input.amount), description: input.comment, sourceIds: [], createdById: actor.userId } });
    const all = await tx.paymentLine.findMany({ where: { paymentId } });
    await tx.payment.update({ where: { id: paymentId }, data: { total: sumLines(all) } });
    await audit(tx, actor, { action: "payment.adjust", entity: "PaymentLine", entityId: line.id, after: input, departmentId: p.employee.departmentId, employeeId: p.employeeId });
    return { total: sumLines(all).toFixed(2) };
  });
}

/** Closes the period: its shifts become locked and can no longer change (PRD 6). */
export async function lockPeriod(actor: Actor, periodId: string) {
  assertGlobal(actor, "payments.manage");
  return prisma.$transaction(async (tx) => {
    const period = await tx.paymentPeriod.findUnique({ where: { id: periodId } });
    if (!period) throw new NotFoundError("period");
    if (period.status !== "calculated") throw new ConflictError("calculate the period before locking it");
    const shifts = await tx.shift.updateMany({
      where: { companyId: period.companyId, deletedAt: null, workDate: { gte: period.periodStart, lte: period.periodEnd }, status: { in: ["planned", "confirmed"] } },
      data: { status: "locked" },
    });
    await tx.paymentPeriod.update({ where: { id: periodId }, data: { status: "locked", lockedAt: new Date() } });
    await audit(tx, actor, { action: "period.lock", entity: "PaymentPeriod", entityId: periodId, after: { lockedShifts: shifts.count } });
    return { lockedShifts: shifts.count };
  });
}

/** Bonuses waiting to be paid (dashboard, PRD 7). */
export async function listBonuses(actor: Actor, raw: unknown = {}) {
  const { status } = z.object({ status: z.enum(["approved", "included", "paid"]).optional() }).parse(raw);
  const manage = scopeOf(actor, "payments.manage") === "all";
  const people = employeeScopeWhere(actor, "employees.view_sensitive");
  if (!manage && !people) return [];
  const rows = await prisma.bonus.findMany({
    where: { AND: [manage ? {} : { employee: people! }, status ? { status } : { status: { in: ["approved", "included"] } }] },
    include: { employee: { select: { firstName: true, lastName: true } }, request: { select: { id: true, number: true } } },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((b) => ({
    id: b.id,
    employee: `${b.employee.firstName} ${b.employee.lastName}`,
    employeeId: b.employeeId,
    amount: Number(b.amount).toFixed(2),
    currency: b.currency,
    period: b.period,
    reason: b.reason,
    source: b.source,
    status: b.status,
    request: b.request,
  }));
}

// ───────────── export for finance (PRD 7) ─────────────

export async function exportRows(actor: Actor, periodId: string) {
  assertGlobal(actor, "payments.manage");
  const period = await prisma.paymentPeriod.findUnique({ where: { id: periodId }, include: { company: true } });
  if (!period) throw new NotFoundError("period");
  const payments = await listPayments(actor, { periodId });
  const sum = (lines: { kind: string; amount: string }[], kind: string) => round2(lines.filter((l) => l.kind === kind).reduce((a, l) => a + Number(l.amount), 0));
  const header = ["employee", "employment_type", "department", "currency", "shifts", "monthly_rate", "bonus", "adjustment", "total", "status", "document", "paid_at", "payment_ref"];
  const rows = payments.map((p) => [
    p.employee.name,
    p.employee.employmentType,
    p.employee.department,
    p.currency,
    sum(p.lines, "shifts"),
    sum(p.lines, "monthly_rate"),
    sum(p.lines, "bonus"),
    sum(p.lines, "adjustment"),
    Number(p.total),
    p.status,
    p.employee.employmentType === "contractor" ? (p.documentOk ? "yes" : "no") : "n/a",
    p.paidAt?.slice(0, 10) ?? "",
    p.paymentRef ?? "",
  ]);
  return { name: `payments-${period.company.name}-${toIsoDate(period.periodStart)}`, header, rows };
}

const coefficientInput = z.object({ companyId: z.string().uuid(), coefficient: z.number().min(0.5).max(5) });

/** Multiplier for shifts on non-working days, per company (PRD 6, default 1.0 — the value is a finance decision). */
export async function setShiftCoefficient(actor: Actor, raw: unknown) {
  assertGlobal(actor, "payments.manage");
  const input = coefficientInput.parse(raw);
  await prisma.$transaction(async (tx) => {
    const before = await tx.company.findUniqueOrThrow({ where: { id: input.companyId } });
    await tx.company.update({ where: { id: input.companyId }, data: { nonWorkingShiftCoefficient: input.coefficient } });
    await audit(tx, actor, {
      action: "company.shift_coefficient",
      entity: "Company",
      entityId: input.companyId,
      before: { coefficient: Number(before.nonWorkingShiftCoefficient) },
      after: { coefficient: input.coefficient },
    });
  });
}

export async function listShiftCoefficients(actor: Actor) {
  assertGlobal(actor, "payments.manage");
  const rows = await prisma.company.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } });
  return rows.map((c) => ({ id: c.id, name: c.name, coefficient: Number(c.nonWorkingShiftCoefficient) }));
}
