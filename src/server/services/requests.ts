import type { Prisma } from "@prisma/client";
import { z } from "zod";
import type { Actor } from "@/server/authz/actor";
import { scopeOf } from "@/server/authz/policy";
import { prisma } from "@/server/db";
import { NotFoundError } from "@/server/errors";
import { addComment, canInitiate, canReassign } from "@/server/requests/engine";
import { checklistSchema, optionsSchema } from "@/server/requests/schema";
import { signedFileUrl } from "@/server/storage";

/**
 * Who sees a request (PRD 2 + phase 1 plan): the initiator, the person it is about and every step assignee always;
 * with requests.view=departments also requests of departments the actor heads; with all — everything.
 */
export function requestWhere(actor: Actor): Prisma.RequestWhereInput {
  const scope = scopeOf(actor, "requests.view");
  if (scope === "all") return {};
  const me = actor.employeeId;
  const own: Prisma.RequestWhereInput[] = me
    ? [{ initiatorId: me }, { subjectEmployeeId: me }, { steps: { some: { assigneeId: me } } }]
    : [];
  if (scope === "departments") own.push({ departmentId: { in: actor.headedDepartmentIds } });
  return own.length ? { OR: own } : { id: { in: [] } };
}

async function canViewRequest(actor: Actor, id: string) {
  return !!(await prisma.request.findFirst({ where: { AND: [{ id }, requestWhere(actor)] }, select: { id: true } }));
}

const name = (e: { firstName: string; lastName: string } | null) => (e ? `${e.firstName} ${e.lastName}` : null);
export const requestNumber = (n: number) => `REQ-${String(n).padStart(4, "0")}`;

const listQuery = z.object({
  status: z.enum(["in_progress", "done", "rejected", "cancelled"]).optional(),
  mine: z.enum(["initiated", "about_me", "all"]).default("all"),
  q: z.string().trim().optional(),
});

export async function listRequests(actor: Actor, raw: unknown = {}) {
  const query = listQuery.parse(raw);
  const filters: Prisma.RequestWhereInput[] = [requestWhere(actor)];
  if (query.status) filters.push({ status: query.status });
  if (query.mine === "initiated") filters.push({ initiatorId: actor.employeeId ?? "" });
  if (query.mine === "about_me") filters.push({ subjectEmployeeId: actor.employeeId ?? "" });
  const rows = await prisma.request.findMany({
    where: { AND: filters },
    include: {
      version: { include: { requestType: true } },
      initiator: { select: { firstName: true, lastName: true } },
      subject: { select: { id: true, firstName: true, lastName: true } },
      steps: { where: { status: { in: ["active", "needs_assignment"] } }, select: { dueAt: true, status: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
  const now = new Date();
  return rows.map((r) => ({
    id: r.id,
    number: requestNumber(r.number),
    type: { nameUk: r.version.requestType.nameUk, nameEn: r.version.requestType.nameEn, kind: r.version.requestType.kind },
    status: r.status,
    initiator: name(r.initiator),
    subject: r.subject ? { id: r.subject.id, name: name(r.subject) } : null,
    createdAt: r.createdAt.toISOString(),
    overdue: r.steps.some((s) => s.dueAt && s.dueAt < now),
    needsAssignment: r.steps.some((s) => s.status === "needs_assignment"),
    isChild: !!r.parentStepId,
  }));
}

export async function getRequest(actor: Actor, id: string) {
  if (!(await canViewRequest(actor, id))) throw new NotFoundError("request");
  const r = await prisma.request.findUniqueOrThrow({
    where: { id },
    include: {
      version: { include: { requestType: true, fields: { orderBy: { order: "asc" } } } },
      initiator: { select: { id: true, firstName: true, lastName: true } },
      subject: { select: { id: true, firstName: true, lastName: true, position: true } },
      department: { select: { id: true, name: true } },
      values: true,
      steps: {
        include: {
          stepTemplate: true,
          assignee: { select: { id: true, firstName: true, lastName: true } },
          system: { select: { id: true, name: true } },
          childRequest: { select: { id: true, number: true, status: true } },
        },
        orderBy: [{ orderGroup: "asc" }, { createdAt: "asc" }],
      },
      parentStep: { select: { request: { select: { id: true, number: true } } } },
      comments: { include: { author: { select: { firstName: true, lastName: true } } }, orderBy: { createdAt: "asc" } },
    },
  });

  const values = Object.fromEntries(r.values.map((v) => [v.fieldKey, v.value]));
  const refs = await resolveRefs(r.version.fields, values);
  const now = new Date();
  const documents = await prisma.document.findMany({
    where: { id: { in: r.steps.flatMap((s) => s.attachments) } },
    select: { id: true, fileName: true, fileKey: true, mimeType: true },
  });
  const docById = new Map(documents.map((d) => [d.id, d]));

  return {
    id: r.id,
    number: requestNumber(r.number),
    status: r.status,
    currentGroup: r.currentGroup,
    createdAt: r.createdAt.toISOString(),
    completedAt: r.completedAt?.toISOString() ?? null,
    type: {
      id: r.version.requestType.id,
      nameUk: r.version.requestType.nameUk,
      nameEn: r.version.requestType.nameEn,
      kind: r.version.requestType.kind,
      version: r.version.version,
    },
    initiator: { id: r.initiator.id, name: name(r.initiator)! },
    subject: r.subject ? { id: r.subject.id, name: name(r.subject)!, position: r.subject.position } : null,
    department: r.department,
    parent: r.parentStep ? { id: r.parentStep.request.id, number: requestNumber(r.parentStep.request.number) } : null,
    fields: r.version.fields.map((f) => ({
      key: f.key,
      labelUk: f.labelUk,
      labelEn: f.labelEn,
      type: f.type,
      required: f.required,
      options: f.options,
      value: values[f.key] ?? null,
      display: displayValue(f.type, values[f.key], refs),
    })),
    steps: r.steps.map((s) => ({
      id: s.id,
      group: s.orderGroup,
      nameUk: s.stepTemplate.nameUk,
      nameEn: s.stepTemplate.nameEn,
      stepType: s.stepTemplate.stepType,
      status: s.status,
      system: s.system,
      assignee: s.assignee ? { id: s.assignee.id, name: name(s.assignee)! } : null,
      dueAt: s.dueAt?.toISOString() ?? null,
      overdue: !!s.dueAt && s.dueAt < now && ["active", "needs_assignment"].includes(s.status),
      completedAt: s.completedAt?.toISOString() ?? null,
      comment: s.comment,
      checklist: s.stepTemplate.checklist ? checklistSchema.parse(s.stepTemplate.checklist) : [],
      checked: (s.checklistState as number[] | null) ?? [],
      requiredFields: s.stepTemplate.requiredFields,
      childRequest: s.childRequest ? { id: s.childRequest.id, number: requestNumber(s.childRequest.number), status: s.childRequest.status } : null,
      attachments: s.attachments.flatMap((docId) => {
        const d = docById.get(docId);
        return d ? [{ id: d.id, fileName: d.fileName, url: signedFileUrl(d) }] : [];
      }),
      isMine: s.assigneeId === actor.employeeId && s.status === "active",
    })),
    comments: r.comments.map((c) => ({ id: c.id, author: name(c.author)!, body: c.body, createdAt: c.createdAt.toISOString() })),
    can: {
      cancel: r.status === "in_progress" && !r.parentStepId && (r.initiatorId === actor.employeeId || actor.isSuperadmin),
      reassign: r.status === "in_progress" && canReassign(actor, r),
      comment: !!actor.employeeId,
    },
  };
}

type Refs = { employees: Map<string, string>; systems: Map<string, string>; departments: Map<string, string> };

async function resolveRefs(fields: { key: string; type: string; options: unknown }[], values: Record<string, unknown>): Promise<Refs> {
  const employeeIds: string[] = [];
  const systemIds: string[] = [];
  const departmentIds: string[] = [];
  for (const f of fields) {
    const v = values[f.key];
    if (v == null) continue;
    if (f.type === "person") employeeIds.push(String(v));
    if (f.type === "systems") systemIds.push(...(v as { systemId: string }[]).map((s) => s.systemId));
    if (f.type === "select" && f.options && !Array.isArray(f.options)) departmentIds.push(String(v));
  }
  const [employees, systems, departments] = await Promise.all([
    prisma.employee.findMany({ where: { id: { in: employeeIds } }, select: { id: true, firstName: true, lastName: true } }),
    prisma.system.findMany({ where: { id: { in: systemIds } }, select: { id: true, name: true } }),
    prisma.department.findMany({ where: { id: { in: departmentIds } }, select: { id: true, name: true } }),
  ]);
  return {
    employees: new Map(employees.map((e) => [e.id, name(e)!])),
    systems: new Map(systems.map((s) => [s.id, s.name])),
    departments: new Map(departments.map((d) => [d.id, d.name])),
  };
}

/** Human-readable value for the request card; dates and options are localized on the client. */
function displayValue(type: string, v: unknown, refs: Refs): unknown {
  if (v == null) return null;
  if (type === "person") return refs.employees.get(String(v)) ?? String(v);
  if (type === "systems") return (v as { systemId: string; level: string }[]).map((s) => ({ system: refs.systems.get(s.systemId) ?? s.systemId, level: s.level }));
  if (type === "select" && refs.departments.has(String(v))) return refs.departments.get(String(v));
  if (type === "file") {
    const f = v as { fileKey: string; fileName: string; mimeType: string };
    return { fileName: f.fileName, url: signedFileUrl(f) };
  }
  return v;
}

export async function commentOnRequest(actor: Actor, requestId: string, raw: unknown) {
  return addComment(actor, requestId, raw, (r) => canViewRequest(actor, r.id));
}

/** "Мої задачі": active steps assigned to me (PRD 7). */
export async function listMyTasks(actor: Actor) {
  if (!actor.employeeId) return [];
  const steps = await prisma.stepInstance.findMany({
    where: { assigneeId: actor.employeeId, status: "active", request: { status: "in_progress" } },
    include: {
      stepTemplate: true,
      system: { select: { name: true } },
      request: {
        include: { version: { include: { requestType: true } }, subject: { select: { firstName: true, lastName: true } } },
      },
    },
    orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }],
  });
  const now = new Date();
  return steps.map((s) => ({
    stepId: s.id,
    requestId: s.requestId,
    number: requestNumber(s.request.number),
    requestType: { nameUk: s.request.version.requestType.nameUk, nameEn: s.request.version.requestType.nameEn },
    nameUk: s.stepTemplate.nameUk,
    nameEn: s.stepTemplate.nameEn,
    stepType: s.stepTemplate.stepType,
    system: s.system?.name ?? null,
    subject: name(s.request.subject),
    dueAt: s.dueAt?.toISOString() ?? null,
    overdue: !!s.dueAt && s.dueAt < now,
  }));
}

/** Steps without an assignee, for those who can reassign (superadmin dashboard, PRD 4). */
export async function listNeedsAssignment(actor: Actor) {
  const scope = scopeOf(actor, "steps.reassign");
  if (!scope) return [];
  const rows = await prisma.stepInstance.findMany({
    where: {
      status: "needs_assignment",
      request: { status: "in_progress", ...(scope === "all" ? {} : { departmentId: { in: actor.headedDepartmentIds } }) },
    },
    include: { stepTemplate: true, system: { select: { name: true } }, request: { select: { id: true, number: true } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((s) => ({
    stepId: s.id,
    requestId: s.request.id,
    number: requestNumber(s.request.number),
    nameUk: s.stepTemplate.nameUk,
    nameEn: s.stepTemplate.nameEn,
    system: s.system?.name ?? null,
  }));
}

/** Overdue open steps within the actor's request visibility (dept head / superadmin dashboards). */
export async function listOverdueSteps(actor: Actor) {
  if (!scopeOf(actor, "requests.view") || scopeOf(actor, "requests.view") === "self") return [];
  const rows = await prisma.stepInstance.findMany({
    where: { status: "active", dueAt: { lt: new Date() }, request: { AND: [{ status: "in_progress" }, requestWhere(actor)] } },
    include: { stepTemplate: true, assignee: { select: { firstName: true, lastName: true } }, request: { select: { id: true, number: true } } },
    orderBy: { dueAt: "asc" },
    take: 50,
  });
  return rows.map((s) => ({
    stepId: s.id,
    requestId: s.request.id,
    number: requestNumber(s.request.number),
    nameUk: s.stepTemplate.nameUk,
    nameEn: s.stepTemplate.nameEn,
    assignee: name(s.assignee),
    dueAt: s.dueAt!.toISOString(),
  }));
}

/** Request types the actor may start, with the form definition of the current version. */
export async function listInitiableTypes(actor: Actor) {
  if (!actor.employeeId) return [];
  const me = await prisma.employee.findUniqueOrThrow({ where: { id: actor.employeeId }, select: { departmentId: true } });
  const types = await prisma.requestType.findMany({
    where: { deletedAt: null, currentVersionId: { not: null } },
    include: { currentVersion: { include: { fields: { orderBy: { order: "asc" } }, steps: true } } },
    orderBy: { nameUk: "asc" },
  });
  return types
    .filter((t) => canInitiate(actor, t, me.departmentId))
    .map((t) => {
      const fillLater = new Set(t.currentVersion!.steps.filter((s) => s.stepType === "fill").flatMap((s) => s.requiredFields));
      return {
        id: t.id,
        code: t.code,
        nameUk: t.nameUk,
        nameEn: t.nameEn,
        kind: t.kind,
        fields: t.currentVersion!.fields
          // fields filled later by fill steps are not asked at start
          .filter((f) => !fillLater.has(f.key))
          .map((f) => ({
            key: f.key,
            labelUk: f.labelUk,
            labelEn: f.labelEn,
            type: f.type,
            required: f.required,
            options: f.options ? optionsSchema.parse(f.options) : null,
          })),
      };
    });
}
