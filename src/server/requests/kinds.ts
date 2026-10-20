import type { RequestKind } from "@prisma/client";
import { addDays, parseIsoDate } from "@/lib/dates";
import { audit } from "@/server/audit";
import type { Actor } from "@/server/authz/actor";
import type { Tx } from "@/server/db";
import { ValidationError } from "@/server/errors";
import { bookUsage } from "@/server/absences/balance";
import { checkAbsence, readAbsenceValues } from "@/server/absences/rules";

/** Default probation length when the profile has none (phase 1 plan, decision 4). */
export const PROBATION_DAYS = 90;

export type Values = Record<string, unknown>;
type RequestCtx = { id: string; kind: RequestKind; subjectEmployeeId: string | null; values: Values };

const todayUtc = (now = new Date()) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

/**
 * Hook when a request starts. Offboarding marks the person as "offboarding" right away (decision 5).
 */
export async function onStart(tx: Tx, actor: Actor | null, r: RequestCtx) {
  if (r.kind === "absence" && r.subjectEmployeeId) {
    // fail fast: type rules, overlaps, policy and balance are checked before anyone gets a step
    await checkAbsence(tx, r.subjectEmployeeId, readAbsenceValues(r.values), { hasDocument: !!r.values.document });
  }
  if (r.kind === "offboarding" && r.subjectEmployeeId) {
    const before = await tx.employee.findUniqueOrThrow({ where: { id: r.subjectEmployeeId } });
    await tx.employee.update({ where: { id: before.id }, data: { status: "offboarding" } });
    await audit(tx, actor, {
      action: "request.offboarding.start",
      entity: "Employee",
      entityId: before.id,
      before: { status: before.status },
      after: { status: "offboarding" },
      departmentId: before.departmentId,
      employeeId: before.id,
    });
  }
}

/** System action of the kind when the request completes (PRD 4). Runs in the same transaction as the completion. */
export async function onComplete(tx: Tx, actor: Actor | null, r: RequestCtx) {
  switch (r.kind) {
    case "generic":
      return;
    case "hiring":
      return completeHiring(tx, actor, r);
    case "onboarding":
      return completeOnboarding(tx, actor, r);
    case "access":
      return completeAccess(tx, actor, r);
    case "offboarding":
      return completeOffboarding(tx, actor, r);
    case "absence":
      return completeAbsence(tx, actor, r);
    default:
      throw new ValidationError({ kind: `${r.kind} is not available in this phase` });
  }
}

async function completeHiring(tx: Tx, actor: Actor | null, r: RequestCtx) {
  const v = r.values;
  const email = String(v.candidate_email ?? "").trim().toLowerCase();
  if (!email) throw new ValidationError({ candidate_email: "required" });
  if (await tx.employee.findUnique({ where: { workEmail: email } })) throw new ValidationError({ candidate_email: "already_exists" });
  const dept = await tx.department.findFirstOrThrow({ where: { id: String(v.department), deletedAt: null } });
  const e = await tx.employee.create({
    data: {
      firstName: String(v.candidate_first_name),
      lastName: String(v.candidate_last_name),
      workEmail: email,
      companyId: dept.companyId,
      departmentId: dept.id,
      position: String(v.position),
      employmentType: v.employment_type === "contractor" ? "contractor" : "employee",
      hireDate: typeof v.desired_date === "string" ? parseIsoDate(v.desired_date) : null,
      status: "candidate",
      createdById: actor?.userId,
    },
  });
  await audit(tx, actor, { action: "request.hiring.complete", entity: "Employee", entityId: e.id, after: e, departmentId: e.departmentId, employeeId: e.id });
}

async function completeOnboarding(tx: Tx, actor: Actor | null, r: RequestCtx) {
  const before = await tx.employee.findUniqueOrThrow({ where: { id: r.subjectEmployeeId! } });
  const start = typeof r.values.start_date === "string" ? parseIsoDate(r.values.start_date) : null;
  const hireDate = before.hireDate ?? start ?? todayUtc();
  const after = await tx.employee.update({
    where: { id: before.id },
    data: { status: "active", hireDate, probationEnd: before.probationEnd ?? addDays(hireDate, PROBATION_DAYS) },
  });
  await audit(tx, actor, {
    action: "request.onboarding.complete",
    entity: "Employee",
    entityId: before.id,
    before: { status: before.status, hireDate: before.hireDate, probationEnd: before.probationEnd },
    after: { status: after.status, hireDate: after.hireDate, probationEnd: after.probationEnd },
    departmentId: after.departmentId,
    employeeId: after.id,
  });
}

async function completeAccess(tx: Tx, actor: Actor | null, r: RequestCtx) {
  const employee = await tx.employee.findUniqueOrThrow({ where: { id: r.subjectEmployeeId! } });
  const wanted = (r.values.systems ?? []) as { systemId: string; level: string }[];
  const now = new Date();
  for (const { systemId, level } of wanted) {
    const active = await tx.accessGrant.findFirst({ where: { employeeId: employee.id, systemId, revokedAt: null } });
    if (active?.accessLevel === level) continue;
    if (active) await tx.accessGrant.update({ where: { id: active.id }, data: { revokedAt: now } });
    const grant = await tx.accessGrant.create({
      data: { employeeId: employee.id, systemId, accessLevel: level, grantedAt: now, requestId: r.id, createdById: actor?.userId },
    });
    await audit(tx, actor, {
      action: active ? "access.change" : "access.grant",
      entity: "AccessGrant",
      entityId: grant.id,
      before: active ? { accessLevel: active.accessLevel } : null,
      after: { systemId, accessLevel: level },
      departmentId: employee.departmentId,
      employeeId: employee.id,
    });
  }
}

async function completeOffboarding(tx: Tx, actor: Actor | null, r: RequestCtx) {
  const employee = await tx.employee.findUniqueOrThrow({ where: { id: r.subjectEmployeeId! } });
  const now = new Date();
  const grants = await tx.accessGrant.updateMany({ where: { employeeId: employee.id, revokedAt: null }, data: { revokedAt: now } });
  const assets = await tx.asset.updateMany({ where: { assignedToId: employee.id, returnedAt: null, deletedAt: null }, data: { returnedAt: now } });
  await tx.employee.update({ where: { id: employee.id }, data: { status: "left" } });
  if (employee.userId) await tx.user.update({ where: { id: employee.userId }, data: { isActive: false } });
  await audit(tx, actor, {
    action: "request.offboarding.complete",
    entity: "Employee",
    entityId: employee.id,
    before: { status: employee.status },
    after: { status: "left", revokedGrants: grants.count, returnedAssets: assets.count, loginDisabled: !!employee.userId },
    departmentId: employee.departmentId,
    employeeId: employee.id,
  });
}

/** Absence approved (PRD 4 kind absence): creates the Absence, books the usage, stores the document. */
async function completeAbsence(tx: Tx, actor: Actor | null, r: RequestCtx) {
  const employeeId = r.subjectEmployeeId!;
  const input = readAbsenceValues(r.values);
  const { type, days } = await checkAbsence(tx, employeeId, input, { hasDocument: !!r.values.document });
  const employee = await tx.employee.findUniqueOrThrow({ where: { id: employeeId } });
  const file = r.values.document as { fileKey: string; fileName: string; mimeType: string; size: number } | undefined;
  const document = file
    ? await tx.document.create({
        data: { employeeId, type: "other", fileKey: file.fileKey, fileName: file.fileName, mimeType: file.mimeType, size: file.size, requestId: r.id, createdById: actor?.userId },
      })
    : null;
  const absence = await tx.absence.create({
    data: {
      employeeId,
      typeId: type.id,
      startDate: parseIsoDate(input.from),
      endDate: parseIsoDate(input.to),
      halfDay: input.halfDay,
      days,
      requestId: r.id,
      documentId: document?.id,
      createdById: actor?.userId,
    },
  });
  const usage = type.deductsBalance ? await bookUsage(tx, employeeId, days, absence.id) : null;
  await audit(tx, actor, {
    action: "request.absence.complete",
    entity: "Absence",
    entityId: absence.id,
    after: { type: type.code, from: input.from, to: input.to, days, balance: usage },
    departmentId: employee.departmentId,
    employeeId,
  });
}
