import type { FormField, Prisma, StepInstance, StepTemplate } from "@prisma/client";
import { z } from "zod";
import { audit } from "@/server/audit";
import type { Actor } from "@/server/authz/actor";
import { can, hasPermission, scopeOf } from "@/server/authz/policy";
import { prisma, type Tx } from "@/server/db";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { bundleForPosition } from "@/server/services/systems";
import { verifyFileRef } from "@/server/storage";
import { createDocument, type UploadedFile, assertFile } from "@/server/services/documents";
import { resolveAssignee } from "./assignees";
import { onComplete, onStart, type Values } from "./kinds";
import { checklistSchema, onRejectSchema, optionsSchema, valueSchema, whoCanInitiateSchema } from "./schema";
import { dueAt } from "./sla";
import { nextIso, workingDayFn } from "@/server/calendar/core";
import { notifyEmployee, requestPayload } from "@/server/notifications/notify";

/**
 * Request engine (PRD 4): a request pins a published template version; step groups run one after another,
 * steps inside a group run in parallel. Every transition runs in one transaction that first locks the
 * request row (SELECT … FOR UPDATE), so parallel steps cannot start the next group twice.
 */

const OPEN: StepInstance["status"][] = ["waiting", "active", "needs_assignment"];

const versionInclude = {
  fields: { orderBy: { order: "asc" } },
  steps: { orderBy: [{ orderGroup: "asc" }, { order: "asc" }] },
  requestType: true,
} satisfies Prisma.RequestTypeVersionInclude;
type Version = Prisma.RequestTypeVersionGetPayload<{ include: typeof versionInclude }>;

// ───────────── helpers ─────────────

function requireEmployee(actor: Actor): string {
  if (!actor.employeeId) throw new ForbiddenError("an employee profile is required to work with requests");
  return actor.employeeId;
}

async function lockRequest(tx: Tx, requestId: string) {
  await tx.$queryRaw`SELECT "id" FROM "request" WHERE "id" = ${requestId}::uuid FOR UPDATE`;
}

async function loadValues(tx: Tx, requestId: string): Promise<Values> {
  const rows = await tx.requestFieldValue.findMany({ where: { requestId } });
  return Object.fromEntries(rows.map((r) => [r.fieldKey, r.value]));
}

async function saveValues(tx: Tx, requestId: string, values: Values) {
  for (const [fieldKey, value] of Object.entries(values)) {
    await tx.requestFieldValue.upsert({
      where: { requestId_fieldKey: { requestId, fieldKey } },
      update: { value: value as Prisma.InputJsonValue },
      create: { requestId, fieldKey, value: value as Prisma.InputJsonValue },
    });
  }
}

const isEmpty = (v: unknown) => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);

/**
 * Validates `raw` against the form fields. `keys` limits which fields are checked (fill steps);
 * `optional` lists required fields that will be filled later by fill steps.
 */
export async function validateValues(
  tx: Tx,
  fields: FormField[],
  raw: Record<string, unknown>,
  opts: { keys?: string[]; optional?: Set<string> } = {},
): Promise<Values> {
  const errors: Record<string, string> = {};
  const out: Values = {};
  for (const f of fields) {
    if (opts.keys && !opts.keys.includes(f.key)) continue;
    const v = raw[f.key];
    if (isEmpty(v)) {
      const required = opts.keys ? true : f.required && !opts.optional?.has(f.key);
      if (required) errors[f.key] = "required";
      continue;
    }
    const options = f.options ? optionsSchema.parse(f.options) : null;
    const parsed = valueSchema(f.type, options).safeParse(v);
    if (!parsed.success) {
      errors[f.key] = parsed.error.issues.map((i) => i.message).join(", ");
      continue;
    }
    const value = parsed.data;
    if (f.type === "person" && !(await tx.employee.findFirst({ where: { id: value as string, deletedAt: null } }))) {
      errors[f.key] = "employee_not_found";
      continue;
    }
    if (f.type === "select" && options && !Array.isArray(options)) {
      const exists =
        options.source === "departments"
          ? await tx.department.findFirst({ where: { id: value as string, deletedAt: null } })
          : await tx.absenceType.findFirst({ where: { id: value as string, deletedAt: null } });
      if (!exists) {
        errors[f.key] = `${options.source}_not_found`;
        continue;
      }
    }
    if (f.type === "systems") {
      const ids = (value as { systemId: string }[]).map((s) => s.systemId);
      if ((await tx.system.count({ where: { id: { in: ids }, isActive: true, deletedAt: null } })) !== ids.length) {
        errors[f.key] = "system_not_found";
        continue;
      }
    }
    if (f.type === "file") {
      const file = value as { fileKey: string; token: string };
      if (!verifyFileRef(file.fileKey, file.token)) {
        errors[f.key] = "invalid_file";
        continue;
      }
    }
    out[f.key] = value;
  }
  if (Object.keys(errors).length) throw new ValidationError(errors);
  return out;
}

function fillLaterKeys(version: Version) {
  return new Set(version.steps.filter((s) => s.stepType === "fill").flatMap((s) => s.requiredFields));
}

export function canInitiate(actor: Actor, type: { whoCanInitiate: unknown; departmentId: string | null }, initiatorDepartmentId: string | null) {
  if (!hasPermission(actor, "requests.initiate") || !actor.employeeId) return false;
  const who = whoCanInitiateSchema.safeParse(type.whoCanInitiate);
  if (!who.success) return false;
  if (who.data.mode === "all") return true;
  if (who.data.mode === "departments") return !!initiatorDepartmentId && who.data.departmentIds.includes(initiatorDepartmentId);
  return actor.isSuperadmin || who.data.roleCodes.includes(actor.roleCode);
}

// ───────────── start ─────────────

const startInput = z.object({ requestTypeId: z.string().uuid(), values: z.record(z.string(), z.unknown()).default({}) });

export async function startRequest(actor: Actor, raw: unknown) {
  const input = startInput.parse(raw);
  const initiatorId = requireEmployee(actor);
  const type = await prisma.requestType.findFirst({
    where: { id: input.requestTypeId, deletedAt: null },
    include: { currentVersion: { include: versionInclude } },
  });
  const initiator = await prisma.employee.findUniqueOrThrow({ where: { id: initiatorId } });
  if (!type?.currentVersion || !canInitiate(actor, type, initiator.departmentId)) throw new NotFoundError("request type");

  return prisma.$transaction(
    async (tx) => {
      const id = await createRequestTx(tx, actor, type.currentVersion!, initiatorId, input.values, null);
      return { id };
    },
    { timeout: 30_000 },
  );
}

async function createRequestTx(
  tx: Tx,
  actor: Actor | null,
  version: Version,
  initiatorId: string,
  rawValues: Record<string, unknown>,
  parentStepId: string | null,
) {
  const values = await validateValues(tx, version.fields, rawValues, { optional: fillLaterKeys(version) });
  const kind = version.requestType.kind;
  // an absence is about the initiator unless the form names someone else
  const subjectId = typeof values.employee === "string" ? values.employee : kind === "absence" ? initiatorId : null;
  const subject = subjectId ? await tx.employee.findUniqueOrThrow({ where: { id: subjectId } }) : null;

  // the initiator must be allowed to see the person the request is about
  if (subject && actor && !(can(actor, "employees.view", { employeeId: subject.id, departmentId: subject.departmentId }) || hasPermission(actor, "directory.view"))) {
    throw new ValidationError({ employee: "employee_not_found" });
  }
  if (kind === "offboarding" && subject?.status === "left") throw new ValidationError({ employee: "already_left" });

  const initiator = await tx.employee.findUniqueOrThrow({ where: { id: initiatorId } });
  const departmentId =
    kind === "hiring" && typeof values.department === "string" ? values.department : (subject?.departmentId ?? initiator.departmentId);

  const request = await tx.request.create({
    data: {
      requestTypeVersionId: version.id,
      initiatorId,
      subjectEmployeeId: subject?.id ?? null,
      status: "in_progress",
      departmentId,
      parentStepId,
      createdById: actor?.userId,
    },
  });
  await saveValues(tx, request.id, values);
  await audit(tx, actor, {
    action: "request.create",
    entity: "Request",
    entityId: request.id,
    after: { number: request.number, type: version.requestType.code, version: version.version, values },
    departmentId,
    employeeId: subject?.id ?? null,
  });
  await onStart(tx, actor, { id: request.id, kind, subjectEmployeeId: subject?.id ?? null, values });
  await advance(tx, actor, request.id, 0);
  return request.id;
}

// ───────────── groups ─────────────

async function loadRequest(tx: Tx, requestId: string) {
  return tx.request.findUniqueOrThrow({
    where: { id: requestId },
    include: { version: { include: versionInclude }, subject: true },
  });
}
type LoadedRequest = Awaited<ReturnType<typeof loadRequest>>;

/** Activates the next group after `afterGroup`; completes the request when there is none. */
async function advance(tx: Tx, actor: Actor | null, requestId: string, afterGroup: number) {
  let group = afterGroup;
  for (;;) {
    const r = await loadRequest(tx, requestId);
    if (r.status !== "in_progress") return;
    const groups = [...new Set(r.version.steps.map((s) => s.orderGroup))].sort((a, b) => a - b);
    const next = groups.find((g) => g > group);
    if (next === undefined) return completeRequest(tx, actor, r);
    await tx.request.update({ where: { id: r.id }, data: { currentGroup: next } });
    await activateGroup(tx, actor, r, next);
    const open = await tx.stepInstance.count({ where: { requestId, orderGroup: next, status: { in: OPEN } } });
    const fresh = await tx.request.findUniqueOrThrow({ where: { id: requestId } });
    // a child request that finished instantly may already have moved this request on
    if (open > 0 || fresh.status !== "in_progress" || fresh.currentGroup !== next) return;
    group = next; // nothing to do in this group (e.g. no systems to process) — move on
  }
}

async function activateGroup(tx: Tx, actor: Actor | null, r: LoadedRequest, group: number) {
  const values = await loadValues(tx, r.id);
  const subjectDepartmentId =
    r.version.requestType.kind === "hiring" && typeof values.department === "string" ? values.department : (r.subject?.departmentId ?? null);
  const now = new Date();

  const taken: string[] = [];
  for (const tpl of r.version.steps.filter((s) => s.orderGroup === group)) {
    const targets: { systemId: string | null; ownerId?: string | null }[] =
      tpl.assigneeRule === "system_owner" ? await systemsForStep(tx, r, values) : [{ systemId: null }];
    if (await skipStep(tx, r.version.requestType.kind, tpl, values)) {
      await tx.stepInstance.create({
        data: { requestId: r.id, stepTemplateId: tpl.id, orderGroup: group, status: "skipped", activatedAt: now, completedAt: now },
      });
      continue;
    }
    for (const target of targets) {
      const assigneeId = await resolveAssignee(tx, tpl.assigneeRule, tpl.assigneeValue, {
        initiatorId: r.initiatorId,
        subjectEmployeeId: r.subjectEmployeeId,
        subjectDepartmentId,
        systemOwnerId: target.ownerId,
        exceptIds: taken,
      });
      if (assigneeId) taken.push(assigneeId);
      const step = await tx.stepInstance.create({
        data: {
          requestId: r.id,
          stepTemplateId: tpl.id,
          orderGroup: group,
          systemId: target.systemId,
          assigneeId,
          status: assigneeId ? "active" : "needs_assignment",
          activatedAt: now,
          dueAt: assigneeId ? await computeDue(tx, assigneeId, now, tpl.slaDays) : null,
        },
      });
      if (step.assigneeId) await notifyEmployee(tx, step.assigneeId, "step_assigned", await requestPayload(tx, r.id, step.id));
      if (step.assigneeId && tpl.stepType === "child_request") await tryAutoStartChild(tx, actor, r, step, tpl, values);
    }
  }
}

/** Systems a system_owner step fans out to: the request's `systems` field, or (offboarding) the person's active grants. */
async function systemsForStep(tx: Tx, r: LoadedRequest, values: Values) {
  if (Array.isArray(values.systems)) {
    const ids = (values.systems as { systemId: string }[]).map((s) => s.systemId);
    const systems = await tx.system.findMany({ where: { id: { in: ids } }, orderBy: { name: "asc" } });
    return systems.map((s) => ({ systemId: s.id, ownerId: s.ownerEmployeeId }));
  }
  if (r.version.requestType.kind === "offboarding" && r.subjectEmployeeId) {
    const grants = await tx.accessGrant.findMany({
      where: { employeeId: r.subjectEmployeeId, revokedAt: null },
      include: { system: true },
      orderBy: { system: { name: "asc" } },
    });
    return grants.map((g) => ({ systemId: g.systemId, ownerId: g.system.ownerEmployeeId }));
  }
  return [];
}

/** SLA counts working days of the assignee's own calendar: their work week and non-working layers (PRD 4, 5). */
async function computeDue(tx: Tx, assigneeId: string, from: Date, slaDays: number) {
  const e = await tx.employee.findUniqueOrThrow({
    where: { id: assigneeId },
    select: { id: true, companyId: true, departmentId: true, locationId: true, location: { select: { timezone: true } } },
  });
  const start = from.toISOString().slice(0, 10);
  const isWorking = await workingDayFn(tx, e, nextIso(start, -1), nextIso(start, slaDays * 3 + 31));
  return dueAt(from, slaDays, e.location?.timezone ?? "UTC", isWorking);
}

/** Approval steps of an absence are skipped when its type needs no approval (e.g. sick leave). */
async function skipStep(tx: Tx, kind: string, tpl: StepTemplate, values: Values) {
  if (kind !== "absence" || tpl.stepType !== "approve" || typeof values.absence_type !== "string") return false;
  const type = await tx.absenceType.findUnique({ where: { id: values.absence_type }, select: { requiresApproval: true } });
  return type ? !type.requiresApproval : false;
}

async function completeRequest(tx: Tx, actor: Actor | null, r: LoadedRequest) {
  const values = await loadValues(tx, r.id);
  await onComplete(tx, actor, { id: r.id, kind: r.version.requestType.kind, subjectEmployeeId: r.subjectEmployeeId, values });
  await tx.request.update({ where: { id: r.id }, data: { status: "done", completedAt: new Date() } });
  await notifyEmployee(tx, r.initiatorId, "request_done", await requestPayload(tx, r.id));
  await audit(tx, actor, { action: "request.done", entity: "Request", entityId: r.id, departmentId: r.departmentId, employeeId: r.subjectEmployeeId });
  if (r.parentStepId) {
    const parent = await tx.stepInstance.findUniqueOrThrow({ where: { id: r.parentStepId } });
    await lockRequest(tx, parent.requestId);
    await finishStep(tx, actor, parent, { status: "done", comment: null, completedById: null });
  }
}

/** Closes a step and moves the request on when its group is finished. */
async function finishStep(
  tx: Tx,
  actor: Actor | null,
  step: StepInstance,
  result: { status: "done"; comment: string | null; completedById: string | null; extra?: Prisma.StepInstanceUpdateInput },
) {
  await tx.stepInstance.update({
    where: { id: step.id },
    data: { status: result.status, comment: result.comment, completedAt: new Date(), completedById: result.completedById, ...result.extra },
  });
  const r = await tx.request.findUniqueOrThrow({ where: { id: step.requestId } });
  await audit(tx, actor, {
    action: "step.done",
    entity: "StepInstance",
    entityId: step.id,
    after: { requestNumber: r.number, comment: result.comment },
    departmentId: r.departmentId,
    employeeId: r.subjectEmployeeId,
  });
  const open = await tx.stepInstance.count({ where: { requestId: r.id, orderGroup: step.orderGroup, status: { in: OPEN } } });
  if (open === 0 && r.status === "in_progress" && r.currentGroup === step.orderGroup) await advance(tx, actor, r.id, step.orderGroup);
}

async function rejectStep(tx: Tx, actor: Actor | null, step: StepInstance & { stepTemplate: StepTemplate }, comment: string) {
  await tx.stepInstance.update({
    where: { id: step.id },
    data: { status: "rejected", comment, completedAt: new Date(), completedById: actor?.employeeId ?? null },
  });
  const r = await tx.request.findUniqueOrThrow({ where: { id: step.requestId } });
  const onReject = onRejectSchema.parse(step.stepTemplate.onReject);
  await audit(tx, actor, {
    action: "step.rejected",
    entity: "StepInstance",
    entityId: step.id,
    after: { requestNumber: r.number, comment, onReject },
    departmentId: r.departmentId,
    employeeId: r.subjectEmployeeId,
  });
  await closeOpenSteps(tx, actor, r.id, "skipped");

  if (onReject.action === "return") {
    // groups from the target onwards run again with fresh step instances; finished ones stay as history
    await advance(tx, actor, r.id, onReject.group - 1);
    return;
  }
  await tx.request.update({ where: { id: r.id }, data: { status: "rejected", completedAt: new Date() } });
  await notifyEmployee(tx, r.initiatorId, "request_rejected", { ...(await requestPayload(tx, r.id)), comment });
  await revertOnStop(tx, actor, r.id);
  if (r.parentStepId) {
    const parent = await tx.stepInstance.findUniqueOrThrow({ where: { id: r.parentStepId }, include: { stepTemplate: true } });
    await lockRequest(tx, parent.requestId);
    await rejectStep(tx, actor, parent, `REQ-${String(r.number).padStart(4, "0")}: ${comment}`);
  }
}

/** Closes all open steps of a request; child requests of those steps are cancelled too. */
async function closeOpenSteps(tx: Tx, actor: Actor | null, requestId: string, status: "skipped") {
  const open = await tx.stepInstance.findMany({ where: { requestId, status: { in: OPEN } }, include: { childRequest: true } });
  for (const s of open) {
    await tx.stepInstance.update({ where: { id: s.id }, data: { status, completedAt: new Date() } });
    if (s.childRequest?.status === "in_progress") await cancelTx(tx, actor, s.childRequest.id);
  }
}

/** Undo start-side effects when a request stops without completing (offboarding → back to active). */
async function revertOnStop(tx: Tx, actor: Actor | null, requestId: string) {
  const r = await loadRequest(tx, requestId);
  if (r.version.requestType.kind === "offboarding" && r.subject?.status === "offboarding") {
    await tx.employee.update({ where: { id: r.subject.id }, data: { status: "active" } });
    await audit(tx, actor, {
      action: "request.offboarding.revert",
      entity: "Employee",
      entityId: r.subject.id,
      before: { status: "offboarding" },
      after: { status: "active" },
      departmentId: r.subject.departmentId,
      employeeId: r.subject.id,
    });
  }
}

// ───────────── child requests ─────────────

async function childPrefill(tx: Tx, parent: LoadedRequest, parentValues: Values, childVersion: Version): Promise<Record<string, unknown>> {
  const prefill: Record<string, unknown> = {};
  for (const f of childVersion.fields) if (f.key in parentValues) prefill[f.key] = parentValues[f.key];
  if (parent.subjectEmployeeId) prefill.employee = parent.subjectEmployeeId;
  const systemsField = childVersion.fields.find((f) => f.type === "systems");
  if (systemsField && isEmpty(prefill[systemsField.key]) && parent.subject) {
    prefill[systemsField.key] = await bundleForPosition(tx, parent.subject.position);
  }
  return prefill;
}

async function childVersionFor(tx: Tx, tpl: StepTemplate) {
  if (!tpl.childRequestTypeId) return null;
  const type = await tx.requestType.findUnique({ where: { id: tpl.childRequestTypeId }, select: { currentVersionId: true } });
  if (!type?.currentVersionId) return null;
  return tx.requestTypeVersion.findUniqueOrThrow({ where: { id: type.currentVersionId }, include: versionInclude });
}

/** Starts the child request right away when the prefill is complete; otherwise the assignee starts it by hand. */
async function tryAutoStartChild(tx: Tx, actor: Actor | null, r: LoadedRequest, step: StepInstance, tpl: StepTemplate, values: Values) {
  const childVersion = await childVersionFor(tx, tpl);
  if (!childVersion || !step.assigneeId) return;
  const prefill = await childPrefill(tx, r, values, childVersion);
  try {
    await validateValues(tx, childVersion.fields, prefill, { optional: fillLaterKeys(childVersion) });
  } catch (err) {
    if (err instanceof ValidationError) return;
    throw err;
  }
  await createRequestTx(tx, actor, childVersion, step.assigneeId, prefill, step.id);
}

// ───────────── step actions ─────────────

const actionInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve"), comment: z.string().trim().max(5000).optional() }),
  z.object({ action: z.literal("reject"), comment: z.string().trim().min(1).max(5000) }),
  z.object({ action: z.literal("checklist"), checked: z.array(z.number().int().min(0)) }),
  z.object({ action: z.literal("complete"), comment: z.string().trim().max(5000).optional() }),
  z.object({ action: z.literal("fill"), values: z.record(z.string(), z.unknown()), comment: z.string().trim().max(5000).optional() }),
  z.object({ action: z.literal("start_child"), values: z.record(z.string(), z.unknown()) }),
]);

async function loadStepForAction(tx: Tx, actor: Actor, stepId: string) {
  const step = await tx.stepInstance.findUnique({ where: { id: stepId }, include: { stepTemplate: true } });
  if (!step) throw new NotFoundError("step");
  await lockRequest(tx, step.requestId);
  const fresh = await tx.stepInstance.findUniqueOrThrow({ where: { id: stepId }, include: { stepTemplate: true, request: true, childRequest: true } });
  // PRD 2: steps are executed only by the assignee — whatever the role
  if (fresh.assigneeId !== actor.employeeId) throw new ForbiddenError("not the assignee");
  if (fresh.status !== "active" || fresh.request.status !== "in_progress") throw new ConflictError("step is not active");
  return fresh;
}

export async function actOnStep(actor: Actor, stepId: string, raw: unknown) {
  requireEmployee(actor);
  const input = actionInput.parse(raw);
  return prisma.$transaction(
    async (tx) => {
      const step = await loadStepForAction(tx, actor, stepId);
      const type = step.stepTemplate.stepType;
      const done = (comment: string | null, extra?: Prisma.StepInstanceUpdateInput) =>
        finishStep(tx, actor, step, { status: "done", comment, completedById: actor.employeeId, extra });

      switch (input.action) {
        case "approve":
          if (type !== "approve") throw new ValidationError({ action: "not_allowed_for_step" });
          return done(input.comment ?? null);
        case "reject":
          if (type !== "approve") throw new ValidationError({ action: "not_allowed_for_step" });
          return rejectStep(tx, actor, step, input.comment);
        case "checklist":
        case "complete": {
          if (type !== "task") throw new ValidationError({ action: "not_allowed_for_step" });
          const items = step.stepTemplate.checklist ? checklistSchema.parse(step.stepTemplate.checklist) : [];
          const checked =
            input.action === "checklist"
              ? [...new Set(input.checked)].filter((i) => i < items.length).sort((a, b) => a - b)
              : ((step.checklistState as number[] | null) ?? []);
          if (input.action === "checklist") {
            await tx.stepInstance.update({ where: { id: step.id }, data: { checklistState: checked } });
            if (checked.length < items.length) return;
            return done(null, { checklistState: checked });
          }
          if (checked.length < items.length) throw new ValidationError({ checklist: "not_all_checked" });
          return done(input.comment ?? null);
        }
        case "fill": {
          if (type !== "fill") throw new ValidationError({ action: "not_allowed_for_step" });
          const version = await tx.requestTypeVersion.findUniqueOrThrow({ where: { id: step.request.requestTypeVersionId }, include: { fields: true } });
          const values = await validateValues(tx, version.fields, input.values, { keys: step.stepTemplate.requiredFields });
          await saveValues(tx, step.requestId, values);
          return done(input.comment ?? null);
        }
        case "start_child": {
          if (type !== "child_request") throw new ValidationError({ action: "not_allowed_for_step" });
          if (step.childRequest) throw new ConflictError("child request already started");
          const childVersion = await childVersionFor(tx, step.stepTemplate);
          if (!childVersion) throw new ValidationError({ childRequestType: "not_published" });
          const r = await loadRequest(tx, step.requestId);
          const prefill = await childPrefill(tx, r, await loadValues(tx, r.id), childVersion);
          await createRequestTx(tx, actor, childVersion, actor.employeeId!, { ...prefill, ...input.values }, step.id);
          return;
        }
      }
    },
    { timeout: 30_000 },
  );
}

/** document step: the file becomes a Document of the person the request is about (PRD 4). */
export async function uploadStepDocument(actor: Actor, stepId: string, file: UploadedFile | null, meta: { validTo?: string | null; comment?: string | null }) {
  requireEmployee(actor);
  assertFile(file);
  return prisma.$transaction(
    async (tx) => {
      const step = await loadStepForAction(tx, actor, stepId);
      if (step.stepTemplate.stepType !== "document") throw new ValidationError({ action: "not_allowed_for_step" });
      const employeeId = step.request.subjectEmployeeId ?? step.request.initiatorId;
      const employee = await tx.employee.findUniqueOrThrow({ where: { id: employeeId } });
      const doc = await createDocument(tx, actor, {
        employee,
        type: step.stepTemplate.documentType ?? "other",
        file,
        validTo: meta.validTo ?? null,
        requestId: step.requestId,
      });
      await finishStep(tx, actor, step, { status: "done", comment: meta.comment ?? null, completedById: actor.employeeId, extra: { attachments: [doc.id] } });
      return { documentId: doc.id };
    },
    { timeout: 30_000 },
  );
}

// ───────────── reassign, cancel, comments ─────────────

export function canReassign(actor: Actor, request: { departmentId: string }) {
  const scope = scopeOf(actor, "steps.reassign");
  return scope === "all" || (scope === "departments" && actor.headedDepartmentIds.includes(request.departmentId));
}

/** The only safeguard against stuck steps (PRD 2): manual reassignment, always audited. */
export async function reassignStep(actor: Actor, stepId: string, assigneeId: string) {
  z.string().uuid().parse(assigneeId);
  return prisma.$transaction(async (tx) => {
    const found = await tx.stepInstance.findUnique({ where: { id: stepId } });
    if (!found) throw new NotFoundError("step");
    await lockRequest(tx, found.requestId);
    const step = await tx.stepInstance.findUniqueOrThrow({ where: { id: stepId }, include: { stepTemplate: true, request: true } });
    if (!canReassign(actor, step.request)) throw new ForbiddenError("steps.reassign");
    if (!["active", "needs_assignment"].includes(step.status) || step.request.status !== "in_progress") throw new ConflictError("step is not open");
    const assignee = await tx.employee.findFirst({ where: { id: assigneeId, deletedAt: null, status: { not: "left" } } });
    if (!assignee) throw new ValidationError({ assigneeId: "not_found" });

    const activatedAt = step.activatedAt ?? new Date();
    await tx.stepInstance.update({
      where: { id: stepId },
      data: { assigneeId, status: "active", dueAt: await computeDue(tx, assigneeId, activatedAt, step.stepTemplate.slaDays) },
    });
    await notifyEmployee(tx, assigneeId, "step_assigned", await requestPayload(tx, step.requestId, stepId));
    await audit(tx, actor, {
      action: "step.reassign",
      entity: "StepInstance",
      entityId: stepId,
      before: { assigneeId: step.assigneeId, status: step.status },
      after: { assigneeId, status: "active" },
      departmentId: step.request.departmentId,
      employeeId: step.request.subjectEmployeeId,
    });
    if (step.stepTemplate.stepType === "child_request") {
      const r = await loadRequest(tx, step.requestId);
      const fresh = await tx.stepInstance.findUniqueOrThrow({ where: { id: stepId } });
      const hasChild = await tx.request.findUnique({ where: { parentStepId: stepId } });
      if (!hasChild) await tryAutoStartChild(tx, actor, r, fresh, step.stepTemplate, await loadValues(tx, r.id));
    }
  });
}

export async function cancelRequest(actor: Actor, requestId: string) {
  return prisma.$transaction(async (tx) => {
    await lockRequest(tx, requestId);
    const r = await tx.request.findUnique({ where: { id: requestId } });
    if (!r) throw new NotFoundError("request");
    const allowed = r.initiatorId === actor.employeeId || actor.isSuperadmin;
    if (!allowed) throw new ForbiddenError("only the initiator or a superadmin can cancel");
    if (r.status !== "in_progress") throw new ConflictError("request is not in progress");
    if (r.parentStepId) throw new ConflictError("child requests are cancelled through their parent");
    await cancelTx(tx, actor, requestId);
  });
}

async function cancelTx(tx: Tx, actor: Actor | null, requestId: string) {
  await closeOpenSteps(tx, actor, requestId, "skipped");
  const r = await tx.request.update({ where: { id: requestId }, data: { status: "cancelled", completedAt: new Date() } });
  await revertOnStop(tx, actor, requestId);
  await audit(tx, actor, { action: "request.cancel", entity: "Request", entityId: requestId, departmentId: r.departmentId, employeeId: r.subjectEmployeeId });
}

export async function addComment(actor: Actor, requestId: string, raw: unknown, canView: (r: { id: string }) => Promise<boolean>) {
  const authorId = requireEmployee(actor);
  const body = z.string().trim().min(1).max(5000).parse((raw as { body?: unknown })?.body);
  if (!(await canView({ id: requestId }))) throw new NotFoundError("request");
  const c = await prisma.comment.create({ data: { requestId, authorId, body } });
  return { id: c.id };
}
