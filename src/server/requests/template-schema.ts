import type { RequestKind } from "@prisma/client";
import { z } from "zod";
import type { Tx } from "@/server/db";
import { checklistSchema, ENABLED_KINDS, KIND_FIELDS, onRejectSchema, optionsSchema } from "./schema";

/** Draft content edited in the template constructor (PRD 4): form fields + linear groups of steps. */
export const fieldDraft = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{0,49}$/, "key: a-z, 0-9, _"),
  labelUk: z.string().trim().min(1).max(200),
  labelEn: z.string().trim().max(200).nullish(),
  type: z.enum(["text", "textarea", "number", "date", "date_range", "select", "multiselect", "person", "file", "systems"]),
  options: optionsSchema.nullish(),
  required: z.boolean().default(false),
});

export const stepDraft = z.object({
  orderGroup: z.number().int().min(1),
  nameUk: z.string().trim().min(1).max(200),
  nameEn: z.string().trim().max(200).nullish(),
  stepType: z.enum(["approve", "task", "fill", "document", "child_request"]),
  assigneeRule: z.enum(["person", "initiator", "initiator_dept_head", "subject_dept_head", "system_owner", "role_first_free"]),
  assigneeValue: z.string().trim().nullish(),
  slaDays: z.number().int().min(0).max(365),
  checklist: checklistSchema.nullish(),
  requiredFields: z.array(z.string()).default([]),
  onReject: onRejectSchema.default({ action: "close" }),
  childRequestTypeId: z.string().uuid().nullish(),
  documentType: z.enum(["contract", "nda", "act", "invoice", "w9", "other"]).nullish(),
});

export const draftContent = z.object({ fields: z.array(fieldDraft), steps: z.array(stepDraft) });
export type DraftContent = z.infer<typeof draftContent>;

/** Renumbers groups to 1..N keeping their order, so "add / remove group" in the UI never leaves gaps. */
export function normalizeGroups(content: DraftContent): DraftContent {
  const groups = [...new Set(content.steps.map((s) => s.orderGroup))].sort((a, b) => a - b);
  const map = new Map(groups.map((g, i) => [g, i + 1]));
  return {
    ...content,
    steps: content.steps.map((s) => ({
      ...s,
      orderGroup: map.get(s.orderGroup)!,
      onReject: s.onReject.action === "return" ? { action: "return" as const, group: map.get(s.onReject.group) ?? s.onReject.group } : s.onReject,
    })),
  };
}

/**
 * Publication check (PRD 4): every field the kind needs is present with the right type, every step has an
 * assignee and an SLA, references point to existing things. Returns human-readable error codes.
 */
export async function validateTemplate(tx: Tx, kind: RequestKind, content: DraftContent, selfTypeId?: string): Promise<string[]> {
  const errors: string[] = [];
  if (!ENABLED_KINDS.includes(kind)) errors.push(`kind ${kind} is not available yet`);

  const keys = new Map<string, string>();
  for (const f of content.fields) {
    if (keys.has(f.key)) errors.push(`field ${f.key}: duplicate key`);
    keys.set(f.key, f.type);
    if (f.type === "select" && (!f.options || (Array.isArray(f.options) && f.options.length === 0))) errors.push(`field ${f.key}: options required`);
    if (f.type === "multiselect" && (!Array.isArray(f.options) || f.options.length === 0)) errors.push(`field ${f.key}: options required`);
  }
  for (const need of KIND_FIELDS[kind]) {
    const type = keys.get(need.key);
    if (!type) errors.push(`kind ${kind}: field "${need.key}" (${need.types.join("/")}) is required`);
    else if (!need.types.includes(type as never)) errors.push(`kind ${kind}: field "${need.key}" must be ${need.types.join("/")}`);
  }
  const sourced = (key: string, source: string) => {
    const f = content.fields.find((x) => x.key === key);
    if (f && (!f.options || Array.isArray(f.options) || f.options.source !== source)) errors.push(`field ${key}: options must be {source: "${source}"}`);
  };
  if (kind === "hiring") sourced("department", "departments");
  if (kind === "absence") sourced("absence_type", "absence_types");

  if (content.steps.length === 0) errors.push("at least one step is required");
  const hasSystemsField = content.fields.some((f) => f.type === "systems");
  for (const [i, s] of content.steps.entries()) {
    const label = `step ${i + 1} "${s.nameUk}"`;
    if (s.assigneeRule === "person") {
      if (!s.assigneeValue) errors.push(`${label}: choose a person`);
      else if (!(await tx.employee.findFirst({ where: { id: s.assigneeValue, deletedAt: null } }))) errors.push(`${label}: person not found`);
    }
    if (s.assigneeRule === "role_first_free") {
      if (!s.assigneeValue) errors.push(`${label}: choose a role`);
      else if (!(await tx.role.findFirst({ where: { code: s.assigneeValue, deletedAt: null } }))) errors.push(`${label}: role not found`);
    }
    if (s.assigneeRule === "system_owner" && !hasSystemsField && kind !== "offboarding") {
      errors.push(`${label}: "system owner" needs a systems field (or kind offboarding)`);
    }
    if (s.assigneeRule === "subject_dept_head" && !keys.has("employee") && kind !== "hiring" && kind !== "absence") {
      errors.push(`${label}: "head of the employee's department" needs a person field "employee"`);
    }
    if (s.stepType === "fill") {
      if (s.requiredFields.length === 0) errors.push(`${label}: choose fields to fill`);
      for (const k of s.requiredFields) if (!keys.has(k)) errors.push(`${label}: unknown field ${k}`);
    }
    if (s.stepType === "child_request") {
      if (!s.childRequestTypeId) errors.push(`${label}: choose the child request type`);
      else if (s.childRequestTypeId === selfTypeId) errors.push(`${label}: a template cannot start itself`);
      else {
        const child = await tx.requestType.findFirst({ where: { id: s.childRequestTypeId, deletedAt: null } });
        if (!child?.currentVersionId) errors.push(`${label}: child request type must be published`);
      }
    }
    if (s.onReject.action === "return") {
      if (s.stepType !== "approve") errors.push(`${label}: only approval steps can return the request`);
      if (s.onReject.group >= s.orderGroup) errors.push(`${label}: can only return to an earlier group`);
    }
  }
  return errors;
}
