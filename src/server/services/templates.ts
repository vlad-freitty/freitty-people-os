import type { Prisma, RequestType } from "@prisma/client";
import { z } from "zod";
import { audit } from "@/server/audit";
import type { Actor } from "@/server/authz/actor";
import type { Permission } from "@/server/authz/permissions";
import { scopeOf } from "@/server/authz/policy";
import { prisma, type Tx } from "@/server/db";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { whoCanInitiateSchema } from "@/server/requests/schema";
import { draftContent, normalizeGroups, validateTemplate, type DraftContent } from "@/server/requests/template-schema";

/**
 * Template constructor (PRD 4). Editing never touches a published version: changes go into a draft
 * (created as a copy of the current version), "publish" makes the draft current and archives the previous one.
 * Dept heads see global templates read-only and manage templates of their departments; other departments → 404.
 */

const metaInput = z.object({
  code: z.string().regex(/^[a-z][a-z0-9_]{1,40}$/),
  nameUk: z.string().trim().min(1).max(200),
  nameEn: z.string().trim().max(200).nullish(),
  kind: z.enum(["generic", "hiring", "onboarding", "access", "offboarding", "absence", "bonus"]),
  departmentId: z.string().uuid().nullish(),
  whoCanInitiate: whoCanInitiateSchema,
});

function canManageType(actor: Actor, type: { departmentId: string | null }, permission: Permission) {
  const scope = scopeOf(actor, permission);
  if (scope === "all") return true;
  return scope === "departments" && !!type.departmentId && actor.headedDepartmentIds.includes(type.departmentId);
}

function canSeeType(actor: Actor, type: { departmentId: string | null }) {
  const scope = scopeOf(actor, "templates.manage");
  if (scope === "all") return true;
  if (scope !== "departments") return false;
  return !type.departmentId || actor.headedDepartmentIds.includes(type.departmentId);
}

function typeWhere(actor: Actor): Prisma.RequestTypeWhereInput {
  const scope = scopeOf(actor, "templates.manage");
  if (scope === "all") return { deletedAt: null };
  if (scope === "departments") return { deletedAt: null, OR: [{ departmentId: null }, { departmentId: { in: actor.headedDepartmentIds } }] };
  throw new ForbiddenError("templates.manage");
}

const versionInclude = {
  fields: { orderBy: { order: "asc" } },
  steps: { orderBy: [{ orderGroup: "asc" }, { order: "asc" }] },
} satisfies Prisma.RequestTypeVersionInclude;

export async function listTemplates(actor: Actor) {
  const types = await prisma.requestType.findMany({
    where: typeWhere(actor),
    include: {
      department: { select: { name: true } },
      currentVersion: { select: { version: true, publishedAt: true } },
      versions: { where: { status: "draft" }, select: { version: true } },
    },
    orderBy: { nameUk: "asc" },
  });
  return types.map((t) => ({
    id: t.id,
    code: t.code,
    nameUk: t.nameUk,
    nameEn: t.nameEn,
    kind: t.kind,
    department: t.department?.name ?? null,
    currentVersion: t.currentVersion?.version ?? null,
    hasDraft: t.versions.length > 0,
    canEdit: canManageType(actor, t, "templates.manage"),
  }));
}

function toContent(v: Prisma.RequestTypeVersionGetPayload<{ include: typeof versionInclude }>): DraftContent {
  return {
    fields: v.fields.map((f) => ({
      key: f.key,
      labelUk: f.labelUk,
      labelEn: f.labelEn,
      type: f.type,
      options: (f.options as DraftContent["fields"][number]["options"]) ?? null,
      required: f.required,
    })),
    steps: v.steps.map((s) => ({
      orderGroup: s.orderGroup,
      nameUk: s.nameUk,
      nameEn: s.nameEn,
      stepType: s.stepType,
      assigneeRule: s.assigneeRule,
      assigneeValue: s.assigneeValue,
      slaDays: s.slaDays,
      checklist: (s.checklist as DraftContent["steps"][number]["checklist"]) ?? null,
      requiredFields: s.requiredFields,
      onReject: s.onReject as DraftContent["steps"][number]["onReject"],
      childRequestTypeId: s.childRequestTypeId,
      documentType: s.documentType,
    })),
  };
}

async function loadType(actor: Actor, id: string) {
  const type = await prisma.requestType.findFirst({ where: { id, deletedAt: null } });
  if (!type || !canSeeType(actor, type)) throw new NotFoundError("template");
  return type;
}

export async function getTemplate(actor: Actor, id: string) {
  const type = await loadType(actor, id);
  const versions = await prisma.requestTypeVersion.findMany({
    where: { requestTypeId: id },
    include: versionInclude,
    orderBy: { version: "desc" },
  });
  const draft = versions.find((v) => v.status === "draft");
  const current = versions.find((v) => v.id === type.currentVersionId);
  const editing = draft ?? current;
  const content = editing ? toContent(editing) : { fields: [], steps: [] };
  return {
    id: type.id,
    code: type.code,
    nameUk: type.nameUk,
    nameEn: type.nameEn,
    kind: type.kind,
    departmentId: type.departmentId,
    whoCanInitiate: whoCanInitiateSchema.parse(type.whoCanInitiate),
    editingVersion: editing ? { version: editing.version, status: editing.status } : null,
    content,
    errors: await validateTemplate(prisma, type.kind, content, type.id),
    versions: versions.map((v) => ({
      version: v.version,
      status: v.status,
      publishedAt: v.publishedAt?.toISOString() ?? null,
      fieldCount: v.fields.length,
      stepCount: v.steps.length,
    })),
    canEdit: canManageType(actor, type, "templates.manage"),
    canPublish: canManageType(actor, type, "templates.publish"),
  };
}

export async function createTemplate(actor: Actor, raw: unknown) {
  const input = metaInput.parse(raw);
  if (!canManageType(actor, { departmentId: input.departmentId ?? null }, "templates.manage")) throw new ForbiddenError("templates.manage");
  if (await prisma.requestType.findUnique({ where: { code: input.code } })) throw new ConflictError("template code exists");
  return prisma.$transaction(async (tx) => {
    const type = await tx.requestType.create({
      data: {
        code: input.code,
        nameUk: input.nameUk,
        nameEn: input.nameEn ?? null,
        kind: input.kind,
        departmentId: input.departmentId ?? null,
        whoCanInitiate: input.whoCanInitiate,
        createdById: actor.userId,
      },
    });
    await tx.requestTypeVersion.create({ data: { requestTypeId: type.id, version: 1, createdById: actor.userId } });
    await audit(tx, actor, { action: "template.create", entity: "RequestType", entityId: type.id, after: input, departmentId: type.departmentId });
    return { id: type.id };
  });
}

export async function updateTemplateMeta(actor: Actor, id: string, raw: unknown) {
  const type = await loadType(actor, id);
  if (!canManageType(actor, type, "templates.manage")) throw new ForbiddenError("templates.manage");
  const input = metaInput.pick({ nameUk: true, nameEn: true, whoCanInitiate: true }).parse(raw);
  await prisma.$transaction(async (tx) => {
    const after = await tx.requestType.update({
      where: { id },
      data: { nameUk: input.nameUk, nameEn: input.nameEn ?? null, whoCanInitiate: input.whoCanInitiate },
    });
    await audit(tx, actor, { action: "template.update", entity: "RequestType", entityId: id, before: type, after, departmentId: type.departmentId });
  });
}

/** Replaces the draft content; creates the draft from the current version if there is none yet. */
export async function saveDraft(actor: Actor, id: string, raw: unknown) {
  const type = await loadType(actor, id);
  if (!canManageType(actor, type, "templates.manage")) throw new ForbiddenError("templates.manage");
  const content = normalizeGroups(draftContent.parse(raw));
  return prisma.$transaction(async (tx) => {
    const draft = await ensureDraft(tx, actor, type);
    await tx.formField.deleteMany({ where: { versionId: draft.id } });
    await tx.stepTemplate.deleteMany({ where: { versionId: draft.id } });
    await writeContent(tx, draft.id, content);
    await audit(tx, actor, { action: "template.draft.save", entity: "RequestTypeVersion", entityId: draft.id, after: content, departmentId: type.departmentId });
    return { version: draft.version, errors: await validateTemplate(tx, type.kind, content, type.id) };
  });
}

async function ensureDraft(tx: Tx, actor: Actor, type: RequestType) {
  const existing = await tx.requestTypeVersion.findFirst({ where: { requestTypeId: type.id, status: "draft" } });
  if (existing) return existing;
  const last = await tx.requestTypeVersion.findFirst({ where: { requestTypeId: type.id }, orderBy: { version: "desc" } });
  return tx.requestTypeVersion.create({ data: { requestTypeId: type.id, version: (last?.version ?? 0) + 1, createdById: actor.userId } });
}

export async function writeContent(tx: Tx, versionId: string, content: DraftContent) {
  await tx.formField.createMany({
    data: content.fields.map((f, order) => ({
      versionId,
      key: f.key,
      labelUk: f.labelUk,
      labelEn: f.labelEn ?? null,
      type: f.type,
      options: (f.options ?? undefined) as Prisma.InputJsonValue | undefined,
      required: f.required,
      order,
    })),
  });
  await tx.stepTemplate.createMany({
    data: content.steps.map((s, order) => ({
      order,
      versionId,
      orderGroup: s.orderGroup,
      nameUk: s.nameUk,
      nameEn: s.nameEn ?? null,
      stepType: s.stepType,
      assigneeRule: s.assigneeRule,
      assigneeValue: s.assigneeValue ?? null,
      slaDays: s.slaDays,
      checklist: (s.checklist ?? undefined) as Prisma.InputJsonValue | undefined,
      requiredFields: s.requiredFields,
      onReject: s.onReject,
      childRequestTypeId: s.childRequestTypeId ?? null,
      documentType: s.documentType ?? null,
    })),
  });
}

/** Draft → published; the previous current version is archived. Requests in progress keep their own version. */
export async function publishTemplate(actor: Actor, id: string) {
  const type = await loadType(actor, id);
  if (!canManageType(actor, type, "templates.publish")) throw new ForbiddenError("templates.publish");
  return prisma.$transaction(async (tx) => {
    const draft = await tx.requestTypeVersion.findFirst({ where: { requestTypeId: id, status: "draft" }, include: versionInclude });
    if (!draft) throw new ConflictError("nothing to publish");
    const errors = await validateTemplate(tx, type.kind, toContent(draft), type.id);
    if (errors.length) throw new ValidationError(errors, "template_invalid");
    if (type.currentVersionId) await tx.requestTypeVersion.update({ where: { id: type.currentVersionId }, data: { status: "archived" } });
    await tx.requestTypeVersion.update({ where: { id: draft.id }, data: { status: "published", publishedAt: new Date(), publishedById: actor.userId } });
    await tx.requestType.update({ where: { id }, data: { currentVersionId: draft.id } });
    await audit(tx, actor, {
      action: "template.publish",
      entity: "RequestType",
      entityId: id,
      before: { currentVersionId: type.currentVersionId },
      after: { currentVersionId: draft.id, version: draft.version },
      departmentId: type.departmentId,
    });
    return { version: draft.version };
  });
}

/** Lookups for the constructor form: roles, people, other published templates. */
export async function constructorOptions(actor: Actor) {
  typeWhere(actor); // permission check
  const [roles, types] = await Promise.all([
    prisma.role.findMany({ where: { deletedAt: null }, select: { code: true, nameUk: true, nameEn: true }, orderBy: { code: "asc" } }),
    prisma.requestType.findMany({
      where: { ...typeWhere(actor), currentVersionId: { not: null } },
      select: { id: true, nameUk: true, nameEn: true, kind: true },
      orderBy: { nameUk: "asc" },
    }),
  ]);
  return { roles, childTypes: types };
}
