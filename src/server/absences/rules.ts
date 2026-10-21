import type { AbsenceType } from "@prisma/client";
import { isIsoDate, parseIsoDate, toIsoDate } from "@/lib/dates";
import type { Tx } from "@/server/db";
import { ValidationError } from "@/server/errors";
import { countAbsenceDays, loadPerson } from "@/server/calendar/core";
import { availableFrom, currentBalance, syncTypeBalance } from "./balance";

/**
 * Validation of an absence against its type and the person's policy (PRD 5, phase 2 plan decisions 7–9).
 * Runs when the request starts and again when it completes (the balance may have changed in between).
 *
 * Phase 6 (Vlad): policy rules never block — "всяке може бути в людей". Only broken data is an error (dates,
 * overlap with an approved absence, no working days, half day on several days). Everything else — min/max days,
 * service before the type is available, not enough balance, a missing document, no PTO for contractors — is a
 * warning the approvers see on the request.
 */

export type AbsenceInput = { typeId: string; from: string; to: string; halfDay: boolean };

export type AbsenceWarning =
  | { code: "min_days"; n: number }
  | { code: "max_days"; n: number }
  | { code: "available_from"; date: string }
  | { code: "not_enough_balance"; balance: number }
  | { code: "document_missing" }
  | { code: "no_policy" }
  | { code: "not_eligible" }
  | { code: "no_hire_date" };

export function readAbsenceValues(values: Record<string, unknown>): AbsenceInput {
  const dates = values.dates as { from?: string; to?: string } | undefined;
  if (!dates?.from || !dates?.to || !isIsoDate(dates.from) || !isIsoDate(dates.to)) throw new ValidationError({ dates: "required" });
  if (typeof values.absence_type !== "string") throw new ValidationError({ absence_type: "required" });
  return { typeId: values.absence_type, from: dates.from, to: dates.to, halfDay: values.half_day === "yes" };
}

export async function checkAbsence(
  tx: Tx,
  employeeId: string,
  input: AbsenceInput,
  opts: { hasDocument: boolean; now?: Date; ignoreAbsenceId?: string },
) {
  const type = await tx.absenceType.findFirst({ where: { id: input.typeId, deletedAt: null } });
  if (!type) throw new ValidationError({ absence_type: "not_found" });
  const errors: Record<string, string> = {};
  if (input.to < input.from) errors.dates = "from_after_to";
  if (input.halfDay && (!type.allowHalfDay || input.from !== input.to)) errors.half_day = "half_day_only_single_day";

  const overlapping = await tx.absence.findFirst({
    where: {
      employeeId,
      status: "approved",
      startDate: { lte: parseIsoDate(input.to) },
      endDate: { gte: parseIsoDate(input.from) },
      ...(opts.ignoreAbsenceId ? { id: { not: opts.ignoreAbsenceId } } : {}),
    },
  });
  if (overlapping) errors.dates = `overlaps_${toIsoDate(overlapping.startDate)}`;
  if (Object.keys(errors).length) throw new ValidationError(errors);

  const warnings: AbsenceWarning[] = [];
  if (type.requiresDocument && !opts.hasDocument) warnings.push({ code: "document_missing" });

  const person = await loadPerson(tx, employeeId);
  const employee = await tx.employee.findUniqueOrThrow({ where: { id: employeeId }, select: { employmentType: true } });
  const synced = type.deductsBalance ? await syncTypeBalance(tx, employeeId, type.id, opts.now) : null;
  const policy = synced?.policy ?? null;
  const days = await countAbsenceDays(tx, person, input.from, input.to, { halfDay: input.halfDay, mode: policy?.countDays ?? "working" });
  if (days <= 0) throw new ValidationError({ dates: "no_working_days" });
  if (type.minDays != null && days < Number(type.minDays)) warnings.push({ code: "min_days", n: Number(type.minDays) });
  if (type.maxDays != null && days > Number(type.maxDays)) warnings.push({ code: "max_days", n: Number(type.maxDays) });

  let balance: number | null = null;
  if (type.deductsBalance) {
    if (employee.employmentType === "contractor") warnings.push({ code: "not_eligible" });
    else if (!policy) warnings.push({ code: "no_policy" });
    else {
      const from = availableFrom(policy, person.hireDate);
      if (!from) warnings.push({ code: "no_hire_date" });
      else if (parseIsoDate(input.from) < from) warnings.push({ code: "available_from", date: toIsoDate(from)! });
      balance = await currentBalance(tx, employeeId, type.id);
      if (!policy.allowNegative && balance < days) warnings.push({ code: "not_enough_balance", balance });
    }
  }
  return { type, days, policy, balance, warnings };
}

/** The last approved absence of the same type that ended before `before` — "days since the last one" (phase 6). */
export async function lastAbsenceOfType(tx: Tx, employeeId: string, typeId: string, before: string, exceptRequestId?: string | null) {
  const last = await tx.absence.findFirst({
    where: {
      employeeId,
      typeId,
      status: "approved",
      endDate: { lt: parseIsoDate(before) },
      ...(exceptRequestId ? { OR: [{ requestId: null }, { requestId: { not: exceptRequestId } }] } : {}),
    },
    orderBy: { endDate: "desc" },
  });
  if (!last) return null;
  const daysSince = Math.round((parseIsoDate(before).getTime() - last.endDate.getTime()) / 86_400_000);
  return { from: toIsoDate(last.startDate)!, to: toIsoDate(last.endDate)!, daysSince };
}

export function typeNeedsApproval(type: Pick<AbsenceType, "requiresApproval">) {
  return type.requiresApproval;
}
