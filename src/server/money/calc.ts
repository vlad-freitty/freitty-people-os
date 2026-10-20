import type { PaymentLineKind, Prisma, RateHistory } from "@prisma/client";
import { toIsoDate } from "@/lib/dates";
import { eachDay, workingDayFn } from "@/server/calendar/core";
import type { Tx } from "@/server/db";
import { rateAt } from "@/server/rates";

/**
 * Payment calculation for one period of one company (PRD 6, phase 3 plan decisions 1–7).
 * Pure bookkeeping: the result is a set of lines per (employee, currency); writing them is done by the service.
 */

export type DraftLine = { kind: PaymentLineKind; amount: number; description: string; sourceIds: string[] };
export type DraftPayment = { employeeId: string; currency: string; lines: DraftLine[] };
export type CalcWarning = { employeeId: string; code: "no_rate_for_shift" | "monthly_rate_with_shifts"; date: string; shiftId?: string };

export const round2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;
const money = (x: number, currency: string) => `${x.toFixed(2)} ${currency}`;

type Period = { companyId: string; periodStart: Date; periodEnd: Date };

/** Monthly salary for the part of the period each monthly rate is in force: amount × days / days-in-month. */
export function monthlyLines(rates: RateHistory[], period: { periodStart: Date; periodEnd: Date }): (DraftLine & { currency: string })[] {
  const from = toIsoDate(period.periodStart)!;
  const to = toIsoDate(period.periodEnd)!;
  const out: (DraftLine & { currency: string })[] = [];
  for (const r of rates.filter((x) => x.rateType === "monthly" && !x.deletedAt)) {
    const start = toIsoDate(r.effectiveFrom)!;
    const end = r.effectiveTo ? toIsoDate(r.effectiveTo)! : to;
    const days = eachDay(start > from ? start : from, end < to ? end : to);
    if (days.length === 0) continue;
    // group days by calendar month: each month is paid as amount × covered/total days
    const byMonth = new Map<string, number>();
    for (const d of days) byMonth.set(d.slice(0, 7), (byMonth.get(d.slice(0, 7)) ?? 0) + 1);
    let amount = 0;
    const parts: string[] = [];
    for (const [month, covered] of byMonth) {
      const [y, m] = month.split("-").map(Number);
      const inMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
      amount += (Number(r.amount) * covered) / inMonth;
      parts.push(covered === inMonth ? month : `${month}: ${covered}/${inMonth}`);
    }
    out.push({
      kind: "monthly_rate",
      currency: r.currency,
      amount: round2(amount),
      // language-neutral: the UI shows the localized kind next to it
      description: `${money(Number(r.amount), r.currency)} · ${parts.join(", ")}`,
      sourceIds: [r.id],
    });
  }
  return out;
}

type ShiftRow = { id: string; employeeId: string; startAt: Date; endAt: Date; workDate: Date };

/** Shift lines grouped by (rate, non-working coefficient). Only confirmed / locked shifts are passed in. */
export async function shiftLines(
  tx: Tx,
  person: { id: string; companyId: string; departmentId: string; locationId: string | null },
  shifts: ShiftRow[],
  rates: RateHistory[],
  coefficient: number,
) {
  const warnings: CalcWarning[] = [];
  const lines: (DraftLine & { currency: string })[] = [];
  if (shifts.length === 0) return { lines, warnings };
  const dates = shifts.map((s) => toIsoDate(s.workDate)!).sort();
  const isWorking = await workingDayFn(tx, person, dates[0], dates[dates.length - 1]);

  const groups = new Map<string, { rate: RateHistory; coef: number; minutes: number; count: number; amount: number; ids: string[] }>();
  for (const s of shifts) {
    const date = toIsoDate(s.workDate)!;
    const rate = rateAt(rates, s.workDate);
    if (!rate) {
      warnings.push({ employeeId: s.employeeId, code: "no_rate_for_shift", date, shiftId: s.id });
      continue;
    }
    if (rate.rateType === "monthly") {
      warnings.push({ employeeId: s.employeeId, code: "monthly_rate_with_shifts", date, shiftId: s.id });
      continue;
    }
    const coef = isWorking(date) ? 1 : coefficient;
    const minutes = Math.round((s.endAt.getTime() - s.startAt.getTime()) / 60_000);
    const base = rate.rateType === "hourly" ? (minutes / 60) * Number(rate.amount) : Number(rate.amount);
    const key = `${rate.id}:${coef}`;
    const g = groups.get(key) ?? { rate, coef, minutes: 0, count: 0, amount: 0, ids: [] };
    g.minutes += minutes;
    g.count += 1;
    g.amount += round2(base * coef);
    g.ids.push(s.id);
    groups.set(key, g);
  }
  for (const g of groups.values()) {
    const unit = g.rate.rateType === "hourly" ? `${round2(g.minutes / 60)} h × ${money(Number(g.rate.amount), g.rate.currency)}/h` : `${g.count} × ${money(Number(g.rate.amount), g.rate.currency)}`;
    lines.push({
      kind: "shifts",
      currency: g.rate.currency,
      amount: round2(g.amount),
      description: g.coef === 1 ? unit : `${unit} · ×${g.coef}`,
      sourceIds: g.ids,
    });
  }
  return { lines, warnings };
}

/** Everything payable in a period, per employee and currency (without adjustments, which are kept as entered). */
export async function draftPayments(tx: Tx, period: Period & { id: string }) {
  const company = await tx.company.findUniqueOrThrow({ where: { id: period.companyId } });
  const coefficient = Number(company.nonWorkingShiftCoefficient);
  const shifts = await tx.shift.findMany({
    where: {
      companyId: period.companyId,
      deletedAt: null,
      status: { in: ["confirmed", "locked"] },
      workDate: { gte: period.periodStart, lte: period.periodEnd },
    },
    orderBy: { startAt: "asc" },
  });
  // monthly salaries and bonuses are booked to the employee's own company (decision 5)
  const monthlyStaff = await tx.employee.findMany({
    where: {
      companyId: period.companyId,
      deletedAt: null,
      status: { not: "candidate" },
      rates: { some: { rateType: "monthly", deletedAt: null, effectiveFrom: { lte: period.periodEnd }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: period.periodStart } }] } },
    },
    select: { id: true },
  });
  // approved bonuses waiting for a payment, plus those already included in an editable payment of this period
  // (a recalculation rebuilds that payment and must keep them)
  const bonuses = await tx.bonus.findMany({
    where: {
      OR: [
        { status: "approved", employee: { companyId: period.companyId } },
        { status: "included", payment: { periodId: period.id, status: { in: ["calculated", "documents_received"] } } },
      ],
    },
  });

  const ids = [...new Set([...shifts.map((s) => s.employeeId), ...monthlyStaff.map((e) => e.id), ...bonuses.map((b) => b.employeeId)])];
  const people = await tx.employee.findMany({ where: { id: { in: ids } }, include: { rates: { where: { deletedAt: null } } } });

  const payments = new Map<string, DraftPayment>();
  const add = (employeeId: string, currency: string, line: DraftLine) => {
    const key = `${employeeId}:${currency}`;
    const p = payments.get(key) ?? { employeeId, currency, lines: [] };
    p.lines.push(line);
    payments.set(key, p);
  };
  const warnings: CalcWarning[] = [];

  for (const person of people) {
    const own = shifts.filter((s) => s.employeeId === person.id);
    const s = await shiftLines(tx, person, own, person.rates, coefficient);
    warnings.push(...s.warnings);
    for (const { currency, ...line } of s.lines) add(person.id, currency, line);
    if (person.companyId === period.companyId) {
      for (const { currency, ...line } of monthlyLines(person.rates, period)) add(person.id, currency, line);
    }
  }
  for (const b of bonuses) {
    add(b.employeeId, b.currency, { kind: "bonus", amount: Number(b.amount), description: `${b.period} · ${b.reason}`.slice(0, 300), sourceIds: [b.id] });
  }
  return { payments: [...payments.values()], warnings };
}

export function sumLines(lines: { amount: Prisma.Decimal | number }[]) {
  return round2(lines.reduce((acc, l) => acc + Number(l.amount), 0));
}
