import type { Tx } from "@/server/db";
import { ValidationError } from "@/server/errors";
import { checkAbsence, lastAbsenceOfType, readAbsenceValues, type AbsenceWarning } from "./rules";

/**
 * What approvers (and the person filling the form) see next to an absence request (phase 6):
 * days since the last approved absence of the same type, the balance of that type and the policy warnings.
 * A broken form (missing dates, overlap) returns `error` instead of throwing — it is only a preview.
 */
export type AbsenceInsight = {
  typeId: string;
  days: number | null;
  balance: number | null;
  warnings: AbsenceWarning[];
  last: { from: string; to: string; daysSince: number } | null;
  error: Record<string, string> | null;
};

export async function absenceInsight(
  tx: Tx,
  employeeId: string,
  values: Record<string, unknown>,
  opts: { requestId?: string | null; ignoreAbsenceId?: string } = {},
): Promise<AbsenceInsight | null> {
  let input;
  try {
    input = readAbsenceValues(values);
  } catch {
    return null;
  }
  const last = await lastAbsenceOfType(tx, employeeId, input.typeId, input.from, opts.requestId);
  try {
    const r = await checkAbsence(tx, employeeId, input, { hasDocument: !!values.document, ignoreAbsenceId: opts.ignoreAbsenceId });
    return { typeId: input.typeId, days: r.days, balance: r.balance, warnings: r.warnings, last, error: null };
  } catch (err) {
    if (err instanceof ValidationError) return { typeId: input.typeId, days: null, balance: null, warnings: [], last, error: (err.details as Record<string, string>) ?? {} };
    throw err;
  }
}
