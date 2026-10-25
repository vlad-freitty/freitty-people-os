"use client";

import {
  Add01Icon,
  Alert02Icon,
  ArrowDown01Icon,
  ArrowDown02Icon,
  ArrowUp01Icon,
  CheckmarkCircle02Icon,
  Delete02Icon,
  Settings02Icon,
  TextFontIcon,
  WorkflowSquare01Icon,
  WorkHistoryIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { localized } from "@/lib/format";
import { api, ApiRequestError } from "../api";
import { ErrorBox } from "../error-box";
import { Badge, Button, Card, Empty, Field, IconTile } from "../ui";
import { ruleIcons, stepIcons } from "./icons";

type FieldType = "text" | "textarea" | "number" | "date" | "date_range" | "select" | "multiselect" | "person" | "file" | "systems";
type Option = { value: string; labelUk: string; labelEn?: string | null };
type Source = "departments" | "absence_types";
type FieldDraft = { key: string; labelUk: string; labelEn?: string | null; type: FieldType; options?: Option[] | { source: Source } | null; required: boolean };
type StepType = "approve" | "task" | "fill" | "document" | "child_request";
type Rule = "person" | "initiator" | "initiator_dept_head" | "subject_dept_head" | "subject_manager" | "system_owner" | "role_first_free";
type StepDraft = {
  orderGroup: number;
  nameUk: string;
  nameEn?: string | null;
  stepType: StepType;
  assigneeRule: Rule;
  assigneeValue?: string | null;
  slaDays: number;
  checklist?: { labelUk: string; labelEn?: string | null }[] | null;
  requiredFields: string[];
  onReject: { action: "close" } | { action: "return"; group: number };
  childRequestTypeId?: string | null;
  documentType?: string | null;
};
type Content = { fields: FieldDraft[]; steps: StepDraft[] };
type Who = { mode: "all" } | { mode: "departments"; departmentIds: string[] } | { mode: "roles"; roleCodes: string[] };

const FIELD_TYPES: FieldType[] = ["text", "textarea", "number", "date", "date_range", "select", "multiselect", "person", "file", "systems"];
const STEP_TYPES: StepType[] = ["approve", "task", "fill", "document", "child_request"];
const RULES: Rule[] = ["person", "initiator", "initiator_dept_head", "subject_dept_head", "subject_manager", "system_owner", "role_first_free"];
const DOC_TYPES = ["contract", "nda", "act", "invoice", "w9", "other"] as const;

export type EditorProps = {
  template: {
    id: string;
    code: string;
    nameUk: string;
    nameEn: string | null;
    kind: string;
    whoCanInitiate: Who;
    editingVersion: { version: number; status: "draft" | "published" | "archived" } | null;
    content: Content;
    errors: string[];
    canEdit: boolean;
    canPublish: boolean;
    versions: { version: number; status: "draft" | "published" | "archived"; publishedAt: string | null; fieldCount: number; stepCount: number }[];
  };
  people: { id: string; label: string }[];
  roles: { code: string; nameUk: string; nameEn: string | null }[];
  childTypes: { id: string; nameUk: string; nameEn: string | null }[];
  departments: { id: string; label: string }[];
};

const move = <T,>(list: T[], i: number, dir: -1 | 1) => {
  const j = i + dir;
  if (j < 0 || j >= list.length) return list;
  const copy = [...list];
  [copy[i], copy[j]] = [copy[j], copy[i]];
  return copy;
};

/** Small round icon button (move up / down / remove). */
function IconAction({ icon, label, onClick, danger = false }: { icon: IconSvgElement; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`inline-flex size-8 items-center justify-center rounded-full text-ink-mute transition disabled:opacity-40 ${danger ? "hover:bg-red-tint hover:text-red" : "hover:bg-cream-deep hover:text-ink"}`}
    >
      <HugeiconsIcon icon={icon} size={16} />
    </button>
  );
}

/** Template constructor (PRD 4): form fields + linear stages of parallel steps. Arrows instead of drag-and-drop. */
export function TemplateEditor({ template, people, roles, childTypes, departments }: EditorProps) {
  const t = useTranslations("templates");
  const tt = useTranslations();
  const to = useTranslations("ops2");
  const locale = useLocale();
  const router = useRouter();
  const [content, setContent] = useState<Content>(template.content);
  const [who, setWho] = useState<Who>(template.whoCanInitiate);
  const [nameUk, setNameUk] = useState(template.nameUk);
  const [nameEn, setNameEn] = useState(template.nameEn ?? "");
  const [errors, setErrors] = useState<string[]>(template.errors);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [pending, start] = useTransition();
  const ro = !template.canEdit;

  const groups = [...new Set(content.steps.map((s) => s.orderGroup))].sort((a, b) => a - b);

  // ── fields ──
  const setField = (i: number, patch: Partial<FieldDraft>) => setContent((c) => ({ ...c, fields: c.fields.map((f, j) => (j === i ? { ...f, ...patch } : f)) }));
  const addField = () =>
    setContent((c) => ({ ...c, fields: [...c.fields, { key: `field_${c.fields.length + 1}`, labelUk: "", type: "text", required: false }] }));

  // ── steps / groups ──
  const indexed = content.steps.map((s, index) => ({ s, index }));
  const setStep = (index: number, patch: Partial<StepDraft>) => setContent((c) => ({ ...c, steps: c.steps.map((s, j) => (j === index ? { ...s, ...patch } : s)) }));
  const newStep = (group: number): StepDraft => ({
    orderGroup: group,
    nameUk: "",
    stepType: "task",
    assigneeRule: "initiator_dept_head",
    slaDays: 2,
    requiredFields: [],
    onReject: { action: "close" },
  });
  const addStep = (group: number) => setContent((c) => ({ ...c, steps: [...c.steps, newStep(group)] }));
  const addGroup = () => addStep((groups.at(-1) ?? 0) + 1);
  const moveGroup = (g: number, dir: -1 | 1) => {
    const other = groups[groups.indexOf(g) + dir];
    if (other === undefined) return;
    setContent((c) => ({
      ...c,
      steps: c.steps.map((s) => ({ ...s, orderGroup: s.orderGroup === g ? other : s.orderGroup === other ? g : s.orderGroup })),
    }));
  };
  const moveStepInGroup = (index: number, dir: -1 | 1) => {
    const group = content.steps[index].orderGroup;
    const sameGroup = indexed.filter((x) => x.s.orderGroup === group).map((x) => x.index);
    const pos = sameGroup.indexOf(index);
    const swapWith = sameGroup[pos + dir];
    if (swapWith === undefined) return;
    setContent((c) => {
      const steps = [...c.steps];
      [steps[index], steps[swapWith]] = [steps[swapWith], steps[index]];
      return { ...c, steps };
    });
  };

  const run = (fn: () => Promise<void>) =>
    start(async () => {
      setError(null);
      setNotice(null);
      try {
        await fn();
        router.refresh();
      } catch (err) {
        if (err instanceof ApiRequestError && Array.isArray(err.error.details)) setErrors(err.error.details as string[]);
        setError(err);
      }
    });

  const saveDraft = () =>
    run(async () => {
      const res = await api<{ errors: string[] }>(`/templates/${template.id}/draft`, { method: "PUT", body: content });
      setErrors(res.errors);
      setNotice(t("saved"));
    });
  const publish = () =>
    run(async () => {
      await api(`/templates/${template.id}/draft`, { method: "PUT", body: content });
      const res = await api<{ version: number }>(`/templates/${template.id}/publish`, { method: "POST" });
      setErrors([]);
      setNotice(t("published", { v: res.version }));
    });
  const saveMeta = () =>
    run(async () => {
      await api(`/templates/${template.id}`, { method: "PATCH", body: { nameUk, nameEn: nameEn || null, whoCanInitiate: who } });
      setNotice(tt("common.saved"));
    });

  const fieldKeys = content.fields.map((f) => f.key);

  return (
    <div className="space-y-6">
      {ro && (
        <p className="flex items-center gap-2 rounded-2xl bg-warn-tint px-4 py-3 text-sm text-warn">
          <HugeiconsIcon icon={Alert02Icon} size={18} />
          {t("readOnly")}
        </p>
      )}
      {template.editingVersion && (
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={template.editingVersion.status === "published" ? "ok" : template.editingVersion.status === "draft" ? "warn" : "neutral"}>
            {t("editing", { v: template.editingVersion.version, status: t(`versionStatus.${template.editingVersion.status}`) })}
          </Badge>
          <Badge>{to("fieldsCount", { n: content.fields.length })}</Badge>
          <Badge>{to("stagesCount", { n: groups.length })}</Badge>
          <Badge>{to("stepsCount", { n: content.steps.length })}</Badge>
        </div>
      )}

      {/* ── settings ── */}
      <Card icon={Settings02Icon} tone="neutral" title={t("meta")} subtitle={to("metaHint")}>
        <fieldset disabled={ro || pending} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("nameUk")}>
              <input className="field" value={nameUk} onChange={(e) => setNameUk(e.target.value)} />
            </Field>
            <Field label={t("nameEn")}>
              <input className="field" value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
            </Field>
          </div>
          <WhoEditor who={who} onChange={setWho} roles={roles} departments={departments} />
          <Button variant="secondary" onClick={saveMeta}>
            {t("saveMeta")}
          </Button>
        </fieldset>
      </Card>

      {/* ── fields ── */}
      <Card icon={TextFontIcon} tone="blue" title={t("fields")} subtitle={to("fieldsHint")}>
        <fieldset disabled={ro} className="space-y-3">
          {content.fields.length === 0 && <Empty icon={TextFontIcon}>{to("noFields")}</Empty>}
          {content.fields.map((f, i) => (
            <div key={i} className="rounded-2xl border border-line p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-blue-tint text-xs font-bold text-blue">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink-2">{f.labelUk || f.key}</span>
                <Badge>{tt(`fieldType.${f.type}`)}</Badge>
                {f.required && <Badge tone="red">{t("required")}</Badge>}
                <span className="flex">
                  <IconAction icon={ArrowUp01Icon} label={t("moveUp")} onClick={() => setContent((c) => ({ ...c, fields: move(c.fields, i, -1) }))} />
                  <IconAction icon={ArrowDown01Icon} label={t("moveDown")} onClick={() => setContent((c) => ({ ...c, fields: move(c.fields, i, 1) }))} />
                  <IconAction icon={Delete02Icon} label={t("remove")} danger onClick={() => setContent((c) => ({ ...c, fields: c.fields.filter((_, j) => j !== i) }))} />
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label={t("key")}>
                  <input className="field font-mono text-xs!" value={f.key} onChange={(e) => setField(i, { key: e.target.value })} />
                </Field>
                <Field label={t("label")}>
                  <input className="field" value={f.labelUk} onChange={(e) => setField(i, { labelUk: e.target.value })} />
                </Field>
                <Field label={t("labelEn")}>
                  <input className="field" value={f.labelEn ?? ""} onChange={(e) => setField(i, { labelEn: e.target.value || null })} />
                </Field>
                <Field label={t("type")}>
                  <select className="field" value={f.type} onChange={(e) => setField(i, { type: e.target.value as FieldType, options: null })}>
                    {FIELD_TYPES.map((x) => (
                      <option key={x} value={x}>
                        {tt(`fieldType.${x}`)}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <label className="mt-3 flex items-center gap-2 text-sm">
                <input type="checkbox" className="size-4 accent-red" checked={f.required} onChange={(e) => setField(i, { required: e.target.checked })} />
                {t("required")}
              </label>
              {(f.type === "select" || f.type === "multiselect") && <OptionsEditor field={f} onChange={(options) => setField(i, { options })} />}
            </div>
          ))}
          <Button type="button" variant="secondary" onClick={addField}>
            <HugeiconsIcon icon={Add01Icon} size={16} />
            {t("addField")}
          </Button>
        </fieldset>
      </Card>

      {/* ── stages & steps ── */}
      <Card icon={WorkflowSquare01Icon} tone="red" title={t("groups")} subtitle={t("groupsHint")}>
        <fieldset disabled={ro} className="space-y-1">
          {groups.length === 0 && <Empty icon={WorkflowSquare01Icon}>{to("noStages")}</Empty>}
          {groups.map((g, gi) => (
            <div key={g}>
              {gi > 0 && (
                <div className="flex justify-center py-1 text-ink-mute" aria-hidden>
                  <HugeiconsIcon icon={ArrowDown02Icon} size={20} />
                </div>
              )}
              <div className="rounded-card border border-line bg-cream/50 p-4">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-navy text-xs font-bold text-white">{gi + 1}</span>
                  <h3 className="text-base font-bold text-ink-2">{t("group", { n: gi + 1 })}</h3>
                  {indexed.filter((x) => x.s.orderGroup === g).length > 1 && <Badge>{to("parallel")}</Badge>}
                  <div className="ml-auto flex">
                    <IconAction icon={ArrowUp01Icon} label={t("moveUp")} onClick={() => moveGroup(g, -1)} />
                    <IconAction icon={ArrowDown01Icon} label={t("moveDown")} onClick={() => moveGroup(g, 1)} />
                    <IconAction icon={Delete02Icon} label={t("remove")} danger onClick={() => setContent((c) => ({ ...c, steps: c.steps.filter((s) => s.orderGroup !== g) }))} />
                  </div>
                </div>
              <div className="space-y-3">
                {indexed
                  .filter((x) => x.s.orderGroup === g)
                  .map(({ s, index }) => (
                    <StepEditor
                      key={index}
                      step={s}
                      groupNumbers={groups}
                      fieldKeys={fieldKeys}
                      people={people}
                      roles={roles}
                      childTypes={childTypes.filter((c) => c.id !== template.id)}
                      onChange={(patch) => setStep(index, patch)}
                      onUp={() => moveStepInGroup(index, -1)}
                      onDown={() => moveStepInGroup(index, 1)}
                      onRemove={() => setContent((c) => ({ ...c, steps: c.steps.filter((_, j) => j !== index) }))}
                    />
                  ))}
              </div>
                <Button type="button" variant="ghost" className="mt-2" onClick={() => addStep(g)}>
                  <HugeiconsIcon icon={Add01Icon} size={16} />
                  {t("addStep")}
                </Button>
              </div>
            </div>
          ))}
          <div className="pt-3">
            <Button type="button" variant="secondary" onClick={addGroup}>
              <HugeiconsIcon icon={Add01Icon} size={16} />
              {t("addGroup")}
            </Button>
          </div>
        </fieldset>
      </Card>

      {/* ── save / publish ── */}
      <div className="sticky bottom-0 -mx-4 space-y-3 border-t border-line bg-paper/95 px-4 py-4 shadow-[0_-4px_12px_rgba(28,39,76,0.06)] backdrop-blur sm:-mx-6 sm:px-6">
        {errors.length > 0 ? (
          <div className="rounded-2xl bg-red-tint px-4 py-3 text-sm text-red-strong">
            <p className="flex items-center gap-2 font-medium">
              <HugeiconsIcon icon={Alert02Icon} size={18} />
              {t("errors")}
            </p>
            <ul className="list-disc pl-5 font-mono text-xs">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="flex items-center gap-2 text-sm font-medium text-ok-strong">
            <HugeiconsIcon icon={CheckmarkCircle02Icon} size={18} />
            {t("noErrors")}
          </p>
        )}
        {notice && <p className="text-sm text-ok">{notice}</p>}
        <ErrorBox error={errors.length ? null : error} />
        {!ro && (
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" disabled={pending} onClick={saveDraft}>
              {t("saveDraft")}
            </Button>
            {template.canPublish && (
              <Button disabled={pending} onClick={publish}>
                {t("publish")}
              </Button>
            )}
          </div>
        )}
      </div>

      <Card icon={WorkHistoryIcon} tone="neutral" title={t("versions")}>
        <ul className="-my-2 divide-y divide-line text-sm">
          {template.versions.map((v) => (
            <li key={v.version} className="flex flex-wrap items-center gap-3 py-2.5">
              <span className="font-mono font-bold text-ink-2">v{v.version}</span>
              <Badge tone={v.status === "published" ? "ok" : v.status === "draft" ? "warn" : "neutral"}>{t(`versionStatus.${v.status}`)}</Badge>
              <span className="text-xs text-ink-mute">
                {to("fieldsCount", { n: v.fieldCount })} · {to("stepsCount", { n: v.stepCount })}
                {v.publishedAt && <> · {new Date(v.publishedAt).toLocaleDateString(locale === "uk" ? "uk-UA" : "en-US")}</>}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function OptionsEditor({ field, onChange }: { field: FieldDraft; onChange: (o: FieldDraft["options"]) => void }) {
  const t = useTranslations("templates");
  const source = field.options && !Array.isArray(field.options) ? field.options.source : "";
  const lines = Array.isArray(field.options) ? field.options.map((o) => [o.value, o.labelUk, o.labelEn ?? ""].filter(Boolean).join(" | ")).join("\n") : "";
  const [text, setText] = useState(lines);
  return (
    <div className="mt-2 space-y-2">
      {field.type === "select" && (
        <Field label={t("optionsSource")}>
          <select className="field max-w-xs" value={source} onChange={(e) => onChange(e.target.value ? { source: e.target.value as Source } : [])}>
            <option value="">{t("optionsList")}</option>
            <option value="departments">{t("optionsDepartments")}</option>
            <option value="absence_types">{t("optionsAbsenceTypes")}</option>
          </select>
        </Field>
      )}
      {!source && (
        <Field label={`${t("options")} · value | UA | EN`}>
          <textarea
            className="field min-h-20 font-mono text-xs!"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              onChange(
                e.target.value
                  .split("\n")
                  .map((l) => l.split("|").map((p) => p.trim()))
                  .filter((p) => p[0])
                  .map(([value, labelUk, labelEn]) => ({ value, labelUk: labelUk || value, labelEn: labelEn || null })),
              );
            }}
          />
        </Field>
      )}
    </div>
  );
}

function StepEditor({
  step,
  groupNumbers,
  fieldKeys,
  people,
  roles,
  childTypes,
  onChange,
  onUp,
  onDown,
  onRemove,
}: {
  step: StepDraft;
  groupNumbers: number[];
  fieldKeys: string[];
  people: { id: string; label: string }[];
  roles: { code: string; nameUk: string; nameEn: string | null }[];
  childTypes: { id: string; nameUk: string; nameEn: string | null }[];
  onChange: (patch: Partial<StepDraft>) => void;
  onUp: () => void;
  onDown: () => void;
  onRemove: () => void;
}) {
  const t = useTranslations("templates");
  const tt = useTranslations();
  const locale = useLocale();
  const checklistText = (step.checklist ?? []).map((c) => c.labelUk).join("\n");
  const earlier = groupNumbers.filter((g) => g < step.orderGroup);

  return (
    <div className="rounded-2xl border border-line bg-paper p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <IconTile icon={stepIcons[step.stepType]} tone={step.stepType === "approve" ? "ok" : step.stepType === "child_request" ? "blue" : "neutral"} size={32} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-ink-2">{step.nameUk || tt(`step.type.${step.stepType}`)}</span>
          <span className="flex items-center gap-1 text-xs text-ink-mute">
            <HugeiconsIcon icon={ruleIcons[step.assigneeRule]} size={13} className="shrink-0" />
            <span className="truncate">{tt(`rule.${step.assigneeRule}`)}</span>
            <span className="shrink-0">· {t("sla")}: {step.slaDays}</span>
          </span>
        </span>
        <span className="flex">
          <IconAction icon={ArrowUp01Icon} label={t("moveUp")} onClick={onUp} />
          <IconAction icon={ArrowDown01Icon} label={t("moveDown")} onClick={onDown} />
          <IconAction icon={Delete02Icon} label={t("remove")} danger onClick={onRemove} />
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-[2fr_2fr_1.3fr]">
        <Field label={t("stepName")}>
          <input className="field" value={step.nameUk} onChange={(e) => onChange({ nameUk: e.target.value })} />
        </Field>
        <Field label={t("stepNameEn")}>
          <input className="field" value={step.nameEn ?? ""} onChange={(e) => onChange({ nameEn: e.target.value || null })} />
        </Field>
        <Field label={t("stepType")}>
          <select className="field" value={step.stepType} onChange={(e) => onChange({ stepType: e.target.value as StepType, onReject: { action: "close" } })}>
            {STEP_TYPES.map((x) => (
              <option key={x} value={x}>
                {tt(`step.type.${x}`)}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Field label={t("rule")}>
          <select className="field" value={step.assigneeRule} onChange={(e) => onChange({ assigneeRule: e.target.value as Rule, assigneeValue: null })}>
            {RULES.map((x) => (
              <option key={x} value={x}>
                {tt(`rule.${x}`)}
              </option>
            ))}
          </select>
        </Field>
        {step.assigneeRule === "person" && (
          <Field label={t("person")}>
            <select className="field" value={step.assigneeValue ?? ""} onChange={(e) => onChange({ assigneeValue: e.target.value || null })}>
              <option value="" />
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
        )}
        {step.assigneeRule === "role_first_free" && (
          <Field label={t("role")}>
            <select className="field" value={step.assigneeValue ?? ""} onChange={(e) => onChange({ assigneeValue: e.target.value || null })}>
              <option value="" />
              {roles.map((r) => (
                <option key={r.code} value={r.code}>
                  {localized(locale, r.nameUk, r.nameEn)}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label={t("sla")}>
          <input className="field" type="number" min={0} value={step.slaDays} onChange={(e) => onChange({ slaDays: Number(e.target.value) })} />
        </Field>
      </div>

      {step.stepType === "task" && (
        <Field label={t("checklist")} className="mt-3">
          <textarea
            className="field min-h-16"
            defaultValue={checklistText}
            onChange={(e) => {
              const items = e.target.value.split("\n").map((l) => l.trim()).filter(Boolean);
              onChange({ checklist: items.length ? items.map((labelUk) => ({ labelUk })) : null });
            }}
          />
        </Field>
      )}

      {step.stepType === "fill" && (
        <div className="mt-3">
          <span className="label">{t("requiredFields")}</span>
          <div className="flex flex-wrap gap-3">
            {fieldKeys.map((k) => (
              <label key={k} className="flex items-center gap-1.5 font-mono text-xs">
                <input
                  type="checkbox"
                  className="size-4 accent-red"
                  checked={step.requiredFields.includes(k)}
                  onChange={(e) => onChange({ requiredFields: e.target.checked ? [...step.requiredFields, k] : step.requiredFields.filter((x) => x !== k) })}
                />
                {k}
              </label>
            ))}
          </div>
        </div>
      )}

      {step.stepType === "child_request" && (
        <Field label={t("childType")} className="mt-3">
          <select className="field" value={step.childRequestTypeId ?? ""} onChange={(e) => onChange({ childRequestTypeId: e.target.value || null })}>
            <option value="" />
            {childTypes.map((c) => (
              <option key={c.id} value={c.id}>
                {localized(locale, c.nameUk, c.nameEn)}
              </option>
            ))}
          </select>
        </Field>
      )}

      {step.stepType === "document" && (
        <Field label={t("documentType")} className="mt-3">
          <select className="field" value={step.documentType ?? "other"} onChange={(e) => onChange({ documentType: e.target.value })}>
            {DOC_TYPES.map((d) => (
              <option key={d} value={d}>
                {tt(`profile.docType.${d}`)}
              </option>
            ))}
          </select>
        </Field>
      )}

      {step.stepType === "approve" && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label={t("onReject")}>
            <select
              className="field"
              value={step.onReject.action === "close" ? "close" : String(step.onReject.group)}
              onChange={(e) => onChange({ onReject: e.target.value === "close" ? { action: "close" } : { action: "return", group: Number(e.target.value) } })}
            >
              <option value="close">{t("onRejectClose")}</option>
              {earlier.map((g) => (
                <option key={g} value={g}>
                  {t("onRejectReturn")} {groupNumbers.indexOf(g) + 1}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}
    </div>
  );
}

function WhoEditor({
  who,
  onChange,
  roles,
  departments,
}: {
  who: Who;
  onChange: (w: Who) => void;
  roles: { code: string; nameUk: string; nameEn: string | null }[];
  departments: { id: string; label: string }[];
}) {
  const t = useTranslations("templates");
  const locale = useLocale();
  const toggle = (list: string[], v: string, on: boolean) => (on ? [...list, v] : list.filter((x) => x !== v));
  return (
    <div className="space-y-2">
      <Field label={t("who")}>
        <select
          className="field max-w-xs"
          value={who.mode}
          onChange={(e) => {
            const mode = e.target.value as Who["mode"];
            onChange(mode === "all" ? { mode } : mode === "departments" ? { mode, departmentIds: [] } : { mode, roleCodes: [] });
          }}
        >
          {(["all", "departments", "roles"] as const).map((m) => (
            <option key={m} value={m}>
              {t(`whoModes.${m}`)}
            </option>
          ))}
        </select>
      </Field>
      {who.mode === "roles" && (
        <div className="flex flex-wrap gap-3">
          {roles.map((r) => (
            <label key={r.code} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={who.roleCodes.includes(r.code)} onChange={(e) => onChange({ mode: "roles", roleCodes: toggle(who.roleCodes, r.code, e.target.checked) })} />
              {localized(locale, r.nameUk, r.nameEn)}
            </label>
          ))}
        </div>
      )}
      {who.mode === "departments" && (
        <div className="flex flex-wrap gap-3">
          {departments.map((d) => (
            <label key={d.id} className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={who.departmentIds.includes(d.id)}
                onChange={(e) => onChange({ mode: "departments", departmentIds: toggle(who.departmentIds, d.id, e.target.checked) })}
              />
              {d.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
