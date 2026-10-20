import type { AbsenceType } from "@prisma/client";
import { isIsoDate, parseIsoDate, toIsoDate } from "@/lib/dates";
import type { Tx } from "@/server/db";
import { ValidationError } from "@/server/errors";
import { countAbsenceDays, loadPerson } from "@/server/calendar/core";
import { availableFrom, currentBalance, effectivePolicy, syncBalance } from "./balance";

/**
 * Validation of an absence against its type and the person's policy (PRD 5, phase 2 plan decisions 7–9).
 * Runs when the request starts and again when it completes (the balance may have changed in between).
 */

export type AbsenceInput = { typeId: string; from: string; to: string; halfDay: boolean };

export function readAbsenceValues(values: Record<string, unknown>): AbsenceInput {
  const dates = values.dates as { from?: string; to?: string } | undefined;
  if (!dates?.from || !dates?.to || !isIsoDate(dates.from) || !isIsoDate(dates.to)) throw new ValidationError({ dates: "required" });
  if (typeof values.absence_type !== "string") throw new ValidationError({ absence_type: "required" });
  return { typeId: values.absence_type, from: dates.from, to: dates.to, halfDay: values.half_day === "yes" };
}

export async function checkAbsence(tx: Tx, employeeId: string, input: AbsenceInput, opts: { hasDocument: boolean; now?: Date }) {
  const type = await tx.absenceType.findFirst({ where: { id: input.typeId, deletedAt: null } });
  if (!type) throw new ValidationError({ absence_type: "not_found" });
  const errors: Record<string, string> = {};
  if (input.to < input.from) errors.dates = "from_after_to";
  if (input.halfDay && (!type.allowHalfDay || input.from !== input.to)) errors.half_day = "half_day_only_single_day";
  if (type.requiresDocument && !opts.hasDocument) errors.document = "required_for_type";

  const overlapping = await tx.absence.findFirst({
    where: { employeeId, status: "approved", startDate: { lte: parseIsoDate(input.to) }, endDate: { gte: parseIsoDate(input.from) } },
  });
  if (overlapping) errors.dates = `overlaps_${toIsoDate(overlapping.startDate)}`;
  if (Object.keys(errors).length) throw new ValidationError(errors);

  const policy = type.deductsBalance ? await effectivePolicy(tx, employeeId) : null;
  if (type.deductsBalance && !policy) throw new ValidationError({ absence_type: "no_absence_policy" });
  const person = await loadPerson(tx, employeeId);
  const days = await countAbsenceDays(tx, person, input.from, input.to, { halfDay: input.halfDay, mode: policy?.countDays ?? "working" });
  if (days <= 0) throw new ValidationError({ dates: "no_working_days" });
  if (type.minDays != null && days < Number(type.minDays)) errors.dates = `min_${Number(type.minDays)}`;
  if (type.maxDays != null && days > Number(type.maxDays)) errors.dates = `max_${Number(type.maxDays)}`;

  if (policy) {
    const from = availableFrom(policy, person.hireDate);
    if (!from) errors.dates = "no_hire_date";
    else if (parseIsoDate(input.from) < from) errors.dates = `available_from_${toIsoDate(from)}`;
    await syncBalance(tx, employeeId, opts.now);
    const balance = await currentBalance(tx, employeeId);
    if (!policy.allowNegative && balance < days) errors.dates = `not_enough_balance_${balance}`;
  }
  if (Object.keys(errors).length) throw new ValidationError(errors);
  return { type, days, policy };
}

export function typeNeedsApproval(type: Pick<AbsenceType, "requiresApproval">) {
  return type.requiresApproval;
}
