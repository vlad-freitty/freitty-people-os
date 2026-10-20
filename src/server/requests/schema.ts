import type { FieldType, RequestKind, StepType } from "@prisma/client";
import { z } from "zod";
import { isIsoDate } from "@/lib/dates";

// JSON shapes stored in the request engine tables, and the per-kind contract (PRD 4, table "Kind і системні дії").

export const whoCanInitiateSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("all") }),
  z.object({ mode: z.literal("departments"), departmentIds: z.array(z.string().uuid()).min(1) }),
  z.object({ mode: z.literal("roles"), roleCodes: z.array(z.string().min(1)).min(1) }),
]);
export type WhoCanInitiate = z.infer<typeof whoCanInitiateSchema>;

export const onRejectSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("close") }),
  z.object({ action: z.literal("return"), group: z.number().int().min(1) }),
]);
export type OnReject = z.infer<typeof onRejectSchema>;

export const checklistSchema = z.array(z.object({ labelUk: z.string().min(1), labelEn: z.string().nullish() }));

/** select / multiselect options; {source: "departments"} lists departments dynamically (used by kind hiring). */
export const optionsSchema = z.union([
  z.array(z.object({ value: z.string().min(1), labelUk: z.string().min(1), labelEn: z.string().nullish() })),
  z.object({ source: z.literal("departments") }),
]);
export type FieldOptions = z.infer<typeof optionsSchema>;

/** Form fields a kind needs, by key and type. The template cannot be published without them. */
export const KIND_FIELDS: Record<RequestKind, { key: string; types: FieldType[] }[]> = {
  generic: [],
  hiring: [
    { key: "position", types: ["text"] },
    { key: "department", types: ["select"] },
    { key: "budget", types: ["number", "text"] },
    { key: "desired_date", types: ["date"] },
    { key: "candidate_first_name", types: ["text"] },
    { key: "candidate_last_name", types: ["text"] },
    { key: "candidate_email", types: ["text"] },
  ],
  onboarding: [{ key: "employee", types: ["person"] }],
  access: [
    { key: "employee", types: ["person"] },
    { key: "systems", types: ["systems"] },
  ],
  offboarding: [
    { key: "employee", types: ["person"] },
    { key: "last_day", types: ["date"] },
  ],
  absence: [],
  bonus: [],
};

/** Kinds whose entities exist in this phase. absence → phase 2, bonus → phase 3. */
export const ENABLED_KINDS: RequestKind[] = ["generic", "hiring", "onboarding", "access", "offboarding"];

export const STEP_TYPES_NEEDING_VALUE: Partial<Record<string, string>> = { person: "employee id", role_first_free: "role code" };

export const systemsValueSchema = z
  .array(z.object({ systemId: z.string().uuid(), level: z.string().trim().min(1).max(50) }))
  .min(1)
  .refine((v) => new Set(v.map((x) => x.systemId)).size === v.length, "duplicate_system");

/** Returned by the upload endpoint; `token` proves the key was issued by us (checked in the engine). */
export const fileValueSchema = z.object({
  fileKey: z.string().min(1),
  fileName: z.string().min(1),
  mimeType: z.string(),
  size: z.number().int().nonnegative(),
  token: z.string().min(1),
});

/** Validates one value against its field type. Reference checks (person, systems, departments) happen in the engine. */
export function valueSchema(type: FieldType, options?: FieldOptions | null) {
  switch (type) {
    case "text":
      return z.string().trim().min(1).max(2000);
    case "textarea":
      return z.string().trim().min(1).max(10_000);
    case "number":
      return z.coerce.number().finite();
    case "date":
      return z.string().refine(isIsoDate, "invalid_date");
    case "date_range":
      return z
        .object({ from: z.string().refine(isIsoDate), to: z.string().refine(isIsoDate) })
        .refine((v) => v.from <= v.to, "from_after_to");
    case "select": {
      if (options && !Array.isArray(options)) return z.string().uuid();
      const values = (options ?? []).map((o) => o.value);
      return z.string().refine((v) => values.includes(v), "not_an_option");
    }
    case "multiselect": {
      const values = Array.isArray(options) ? options.map((o) => o.value) : [];
      return z.array(z.string().refine((v) => values.includes(v), "not_an_option")).min(1);
    }
    case "person":
      return z.string().uuid();
    case "file":
      return fileValueSchema;
    case "systems":
      return systemsValueSchema;
  }
}

export const STEP_TYPES: StepType[] = ["approve", "task", "fill", "document", "child_request"];
