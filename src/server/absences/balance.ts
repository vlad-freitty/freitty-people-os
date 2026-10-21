import type { AbsencePolicy, Prisma } from "@prisma/client";
import { addDays, addMonths, toIsoDate } from "@/lib/dates";
import type { Tx } from "@/server/db";

/**
 * Absence balance (PRD 5). The balance is never stored as a number: it is the sum of ledger entries
 * (accrual, usage, expiry, carryover, manual_adjustment) grouped by accrual period (AbsenceBalance).
 * syncBalance() books everything due up to a date and is idempotent — every automatic entry has a unique key.
 * Phase 6: one balance per absence type — every type has its own policy (person → department → company → default).
 * Contractors have no PTO (policy): no policy, no balance; their absences are only recorded.
 */

type Policy = Pick<
  AbsencePolicy,
  "id" | "daysPerPeriod" | "accrual" | "periodStart" | "expiry" | "expiryMonths" | "carryoverMax" | "availableAfterDays" | "allowNegative" | "countDays"
>;

export type Period = { start: Date; end: Date };

const n = (d: Prisma.Decimal | number) => Number(d);
/** Ledger amounts have one decimal; rounding goes to the nearest 0.1. */
export const round1 = (x: number) => Math.round(x * 10) / 10;
/** Pro-rated upfront amounts go to the nearest half day. */
const roundHalf = (x: number) => Math.round(x * 2) / 2;

const iso = (d: Date) => toIsoDate(d)!;
const utcToday = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

/** Accrual periods from the hire date up to the one containing `until` (decision 5). */
export function periodsUntil(policy: Pick<Policy, "periodStart">, hireDate: Date, until: Date): Period[] {
  const periods: Period[] = [];
  if (hireDate > until) return periods;
  if (policy.periodStart === "month") {
    // calendar months: the rest of the hire month, then every month (Remote Days "within the calendar month")
    let start = hireDate;
    while (start <= until) {
      const next = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
      periods.push({ start, end: addDays(next, -1) });
      start = next;
    }
    return periods;
  }
  if (policy.periodStart === "hire_date") {
    for (let k = 0; ; k++) {
      const start = addMonths(hireDate, 12 * k);
      if (start > until) break;
      periods.push({ start, end: addDays(addMonths(hireDate, 12 * (k + 1)), -1) });
    }
    return periods;
  }
  // jan_1: the first period is the rest of the hire year
  let start = hireDate;
  for (;;) {
    if (start > until) break;
    const end = new Date(Date.UTC(start.getUTCFullYear(), 11, 31));
    periods.push({ start, end });
    start = new Date(Date.UTC(start.getUTCFullYear() + 1, 0, 1));
  }
  return periods;
}

/** Accrual entries of one period: [date, amount]. */
export function accrualsFor(policy: Pick<Policy, "accrual" | "periodStart" | "daysPerPeriod">, period: Period, until: Date): [Date, number][] {
  const total = n(policy.daysPerPeriod);
  if (policy.accrual === "upfront" || policy.periodStart === "month") {
    if (period.start > until) return [];
    let amount = total;
    if (policy.periodStart === "jan_1") {
      const yearStart = Date.UTC(period.start.getUTCFullYear(), 0, 1);
      const yearEnd = Date.UTC(period.start.getUTCFullYear(), 11, 31);
      const share = (yearEnd - period.start.getTime() + 86_400_000) / (yearEnd - yearStart + 86_400_000);
      if (share < 1) amount = roundHalf(total * share);
    }
    return [[period.start, amount]];
  }
  // monthly: total/12 at the start of each month of the period; rounding drift is absorbed so 12 months = total
  const out: [Date, number][] = [];
  const firstMonth = policy.periodStart === "jan_1" ? period.start.getUTCMonth() : 0;
  const months = policy.periodStart === "jan_1" ? 12 - firstMonth : 12;
  for (let m = 0; m < months; m++) {
    const date = m === 0 ? period.start : policy.periodStart === "jan_1" ? new Date(Date.UTC(period.start.getUTCFullYear(), firstMonth + m, 1)) : addMonths(period.start, m);
    if (date > until || date > period.end) break;
    const k = policy.periodStart === "jan_1" ? firstMonth + m : m;
    out.push([date, round1((total * (k + 1)) / 12) - round1((total * k) / 12)]);
  }
  return out;
}

/** The day the unused rest of a period expires, or null (never). */
export function expiryDate(policy: Pick<Policy, "expiry" | "expiryMonths">, period: Period): Date | null {
  const dayAfter = addDays(period.end, 1);
  if (policy.expiry === "never") return null;
  if (policy.expiry === "end_of_period") return dayAfter;
  return addMonths(dayAfter, policy.expiryMonths ?? 0);
}

/** Effective policy of one type: person → department (up the tree) → company → the type's default (decision 4, phase 6). */
export async function effectivePolicy(tx: Tx, employeeId: string, absenceTypeId: string): Promise<AbsencePolicy | null> {
  const e = await tx.employee.findUniqueOrThrow({ where: { id: employeeId }, select: { departmentId: true, companyId: true, employmentType: true } });
  if (e.employmentType === "contractor") return null;
  const live = { absenceTypeId, policy: { deletedAt: null } };
  const own = await tx.absencePolicyAssignment.findFirst({ where: { ...live, employeeId }, include: { policy: true } });
  if (own) return own.policy;
  let current: string | null = e.departmentId;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current);
    const a = await tx.absencePolicyAssignment.findFirst({ where: { ...live, departmentId: current }, include: { policy: true } });
    if (a) return a.policy;
    const d: { parentId: string | null } | null = await tx.department.findUnique({ where: { id: current }, select: { parentId: true } });
    current = d?.parentId ?? null;
  }
  const c = await tx.absencePolicyAssignment.findFirst({ where: { ...live, companyId: e.companyId }, include: { policy: true } });
  if (c) return c.policy;
  return tx.absencePolicy.findFirst({ where: { absenceTypeId, isDefault: true, deletedAt: null }, orderBy: { createdAt: "asc" } });
}

/** Types that keep a balance (deductsBalance), in display order. */
export function balanceTypes(tx: Tx) {
  return tx.absenceType.findMany({ where: { deletedAt: null, deductsBalance: true }, orderBy: [{ countsAsWorking: "asc" }, { createdAt: "asc" }] });
}

async function entry(tx: Tx, data: Prisma.AbsenceLedgerEntryUncheckedCreateInput) {
  if (data.idempotencyKey && (await tx.absenceLedgerEntry.findUnique({ where: { idempotencyKey: data.idempotencyKey } }))) return false;
  await tx.absenceLedgerEntry.create({ data });
  return true;
}

async function sumOf(tx: Tx, balanceId: string) {
  const r = await tx.absenceLedgerEntry.aggregate({ where: { balanceId }, _sum: { amount: true } });
  return round1(n(r._sum.amount ?? 0));
}

/** Books accruals, carryovers and expiries of every balance type due up to `now`. Safe to run any number of times. */
export async function syncBalance(tx: Tx, employeeId: string, now = new Date()) {
  let booked = 0;
  for (const type of await balanceTypes(tx)) booked += (await syncTypeBalance(tx, employeeId, type.id, now)).booked;
  return { booked };
}

/** The same for one absence type. */
export async function syncTypeBalance(tx: Tx, employeeId: string, absenceTypeId: string, now = new Date()) {
  const today = utcToday(now);
  const policy = await effectivePolicy(tx, employeeId, absenceTypeId);
  const e = await tx.employee.findUniqueOrThrow({ where: { id: employeeId }, select: { hireDate: true, status: true } });
  if (!policy || !e.hireDate || e.status === "candidate") return { policy, booked: 0 };
  let booked = 0;

  // monthly periods that already expired without carryover add nothing — they are not created (years of Remote Days)
  const skipExpired = policy.periodStart === "month" && policy.expiry !== "never" && n(policy.carryoverMax) === 0;
  const periods = periodsUntil(policy, e.hireDate, today).filter((p) => {
    const exp = expiryDate(policy, p);
    return !skipExpired || !exp || exp > today;
  });
  for (const p of periods) {
    const b = await tx.absenceBalance.upsert({
      where: { employeeId_policyId_periodStart: { employeeId, policyId: policy.id, periodStart: p.start } },
      update: {},
      create: { employeeId, policyId: policy.id, absenceTypeId, periodStart: p.start, periodEnd: p.end },
    });
    for (const [date, amount] of accrualsFor(policy, p, today)) {
      if (amount === 0) continue;
      if (await entry(tx, { balanceId: b.id, type: "accrual", amount, date, idempotencyKey: `accrual:${b.id}:${iso(date)}` })) booked++;
    }
  }
  // every period of this policy, including skipped old ones created while they were current
  const balances = await tx.absenceBalance.findMany({ where: { employeeId, policyId: policy.id, periodStart: { lte: today } }, orderBy: { periodStart: "asc" } });

  for (const [i, b] of balances.entries()) {
    const period = { start: b.periodStart, end: b.periodEnd };
    const next = balances[i + 1];
    // carryover at the start of the next period: up to carryover_max (everything when nothing ever expires)
    if (next && !b.closedAt) {
      const rest = await sumOf(tx, b.id);
      const carry = policy.expiry === "never" ? Math.max(rest, 0) : Math.min(Math.max(rest, 0), n(policy.carryoverMax));
      if (carry > 0) {
        await entry(tx, { balanceId: b.id, type: "carryover", amount: -carry, date: b.periodEnd, comment: "→", idempotencyKey: `carryover-out:${b.id}` });
        await entry(tx, { balanceId: next.id, type: "carryover", amount: carry, date: next.periodStart, comment: "←", idempotencyKey: `carryover-in:${b.id}` });
        booked += 2;
      }
      await tx.absenceBalance.update({ where: { id: b.id }, data: { closedAt: now } });
    }
    const expires = expiryDate(policy, period);
    if (expires && expires <= today) {
      const rest = await sumOf(tx, b.id);
      if (rest > 0 && (await entry(tx, { balanceId: b.id, type: "expiry", amount: -rest, date: expires, idempotencyKey: `expiry:${b.id}` }))) booked++;
    }
  }
  return { policy, booked };
}

/** Current balance of one type: the person's entries of that type (expired periods already sum to zero). */
export async function currentBalance(tx: Tx, employeeId: string, absenceTypeId: string) {
  const r = await tx.absenceLedgerEntry.aggregate({ where: { balance: { employeeId, absenceTypeId } }, _sum: { amount: true } });
  return round1(n(r._sum.amount ?? 0));
}

/**
 * Books the usage of an approved absence. Days are taken FIFO: the oldest period that has not expired first,
 * the rest from the current period — it may go below zero: policy rules never block (Vlad, phase 6), approvers saw
 * the warning. No policy (contractor, type without a policy) → nothing is booked.
 */
export async function bookUsage(tx: Tx, employeeId: string, absenceTypeId: string, days: number, absenceId: string, now = new Date()) {
  const { policy } = await syncTypeBalance(tx, employeeId, absenceTypeId, now);
  if (!policy) return null;
  const available = await currentBalance(tx, employeeId, absenceTypeId);

  const today = utcToday(now);
  const balances = await tx.absenceBalance.findMany({ where: { employeeId, policyId: policy.id }, orderBy: { periodStart: "asc" } });
  const open = balances.filter((b) => {
    const exp = expiryDate(policy, { start: b.periodStart, end: b.periodEnd });
    return !exp || exp > today;
  });
  let left = days;
  for (const [i, b] of open.entries()) {
    const isLast = i === open.length - 1;
    const rest = await sumOf(tx, b.id);
    const take = isLast ? left : Math.min(Math.max(rest, 0), left);
    if (take <= 0) continue;
    await entry(tx, { balanceId: b.id, type: "usage", amount: -round1(take), date: today, absenceId, idempotencyKey: `usage:${absenceId}:${b.id}` });
    left = round1(left - take);
    if (left <= 0) break;
  }
  return { before: available, after: round1(available - days) };
}

/** Gives the days of a cancelled absence back to the periods they were taken from. */
export async function reverseUsage(tx: Tx, absenceId: string, now = new Date()) {
  const used = await tx.absenceLedgerEntry.findMany({ where: { absenceId, type: "usage" } });
  for (const u of used) {
    if (n(u.amount) >= 0) continue;
    await entry(tx, {
      balanceId: u.balanceId,
      type: "usage",
      amount: -n(u.amount),
      date: utcToday(now),
      absenceId,
      comment: "reversal",
      idempotencyKey: `usage-reversal:${u.id}`,
    });
  }
}

/** Date the person may start using the balance (decision 7). */
export function availableFrom(policy: Pick<Policy, "availableAfterDays">, hireDate: Date | null) {
  return hireDate ? addDays(hireDate, policy.availableAfterDays) : null;
}

