"use client";

import { Attachment01Icon, Cancel01Icon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { localized } from "@/lib/format";
import { Button } from "../ui";

export type FieldDef = {
  key: string;
  labelUk: string;
  labelEn: string | null;
  type: "text" | "textarea" | "number" | "date" | "date_range" | "select" | "multiselect" | "person" | "file" | "systems";
  required: boolean;
  options: { value: string; labelUk: string; labelEn?: string | null }[] | { source: "departments" | "absence_types" } | null;
};

export type Lookups = {
  people: { id: string; label: string }[];
  systems: { id: string; name: string }[];
  departments: { id: string; label: string }[];
  absenceTypes: { id: string; label: string }[];
};

type SystemsValue = { systemId: string; level: string }[];
type FileValue = { fileKey: string; fileName: string; mimeType: string; size: number; token: string };

/** Renders one request form field by its type (PRD 4: text … file, plus systems). */
export function FieldInput({
  field,
  value,
  onChange,
  lookups,
}: {
  field: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
  lookups: Lookups;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const label = localized(locale, field.labelUk, field.labelEn);
  const str = typeof value === "string" || typeof value === "number" ? String(value) : "";

  const control = (() => {
    switch (field.type) {
      case "text":
        return <input className="field" value={str} onChange={(e) => onChange(e.target.value)} required={field.required} />;
      case "textarea":
        return <textarea className="field min-h-24" value={str} onChange={(e) => onChange(e.target.value)} required={field.required} />;
      case "number":
        return <input className="field" type="number" step="any" value={str} onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))} required={field.required} />;
      case "date":
        return <input className="field" type="date" value={str} onChange={(e) => onChange(e.target.value)} required={field.required} />;
      case "date_range": {
        const v = (value as { from?: string; to?: string } | null) ?? {};
        return (
          <div className="grid grid-cols-2 gap-2">
            <input className="field" type="date" value={v.from ?? ""} onChange={(e) => onChange({ ...v, from: e.target.value })} required={field.required} />
            <input className="field" type="date" value={v.to ?? ""} onChange={(e) => onChange({ ...v, to: e.target.value })} required={field.required} />
          </div>
        );
      }
      case "select": {
        const options = Array.isArray(field.options)
          ? field.options.map((o) => ({ value: o.value, label: localized(locale, o.labelUk, o.labelEn) }))
          : (field.options?.source === "absence_types" ? lookups.absenceTypes : lookups.departments).map((d) => ({ value: d.id, label: d.label }));
        return (
          <select className="field" value={str} onChange={(e) => onChange(e.target.value)} required={field.required}>
            <option value="">{t("requests2.chooseOption")}</option>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        );
      }
      case "multiselect": {
        const selected = Array.isArray(value) ? (value as string[]) : [];
        const options = Array.isArray(field.options) ? field.options : [];
        return (
          <div className="flex flex-wrap gap-2">
            {options.map((o) => (
              <label
                key={o.value}
                className={`inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition has-focus-visible:ring-2 has-focus-visible:ring-ink/20 ${
                  selected.includes(o.value) ? "border-navy bg-navy text-white" : "border-line-strong bg-paper text-ink-soft hover:text-ink"
                }`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={selected.includes(o.value)}
                  onChange={(e) => onChange(e.target.checked ? [...selected, o.value] : selected.filter((x) => x !== o.value))}
                />
                {localized(locale, o.labelUk, o.labelEn)}
              </label>
            ))}
          </div>
        );
      }
      case "person":
        return (
          <select className="field" value={str} onChange={(e) => onChange(e.target.value)} required={field.required}>
            <option value="">{t("requests2.choosePerson")}</option>
            {lookups.people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        );
      case "file":
        return <FileField value={value as FileValue | null} onChange={onChange} />;
      case "systems":
        return <SystemsField value={(value as SystemsValue | null) ?? []} onChange={onChange} systems={lookups.systems} />;
    }
  })();

  return (
    <div>
      <span className="label">
        {label}
        {field.required && <span className="text-red"> *</span>}
      </span>
      {control}
      <span className="sr-only">{t(`fieldType.${field.type}`)}</span>
    </div>
  );
}

function SystemsField({ value, onChange, systems }: { value: SystemsValue; onChange: (v: SystemsValue) => void; systems: { id: string; name: string }[] }) {
  const t = useTranslations();
  const set = (i: number, patch: Partial<SystemsValue[number]>) => onChange(value.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  return (
    <div className="space-y-2 rounded-2xl bg-cream p-3">
      {value.map((row, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
          <select className="field" value={row.systemId} onChange={(e) => set(i, { systemId: e.target.value })} aria-label={t("step.system")}>
            <option value="">{t("systems.chooseSystem")}</option>
            {systems.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <input className="field" value={row.level} placeholder={t("systems.level")} onChange={(e) => set(i, { level: e.target.value })} />
          <button
            type="button"
            aria-label={t("templates.remove")}
            title={t("templates.remove")}
            className="flex size-10 items-center justify-center rounded-full text-ink-mute hover:bg-paper hover:text-red"
            onClick={() => onChange(value.filter((_, j) => j !== i))}
          >
            <HugeiconsIcon icon={Cancel01Icon} size={16} />
          </button>
        </div>
      ))}
      <Button type="button" variant="ghost" onClick={() => onChange([...value, { systemId: "", level: "" }])}>
        <HugeiconsIcon icon={PlusSignIcon} size={16} />
        {t("systems.addItem")}
      </Button>
    </div>
  );
}

function FileField({ value, onChange }: { value: FileValue | null; onChange: (v: FileValue | null) => void }) {
  const t = useTranslations();
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-2">
      <input
        type="file"
        className="field"
        aria-label={t("step.file")}
        disabled={busy}
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return onChange(null);
          setBusy(true);
          try {
            const body = new FormData();
            body.append("file", f);
            const res = await fetch("/api/v1/files", { method: "POST", body });
            const json = await res.json();
            onChange(res.ok ? json.data : null);
          } finally {
            setBusy(false);
          }
        }}
      />
      {busy && <p className="text-xs text-ink-mute">{t("requests2.uploading")}</p>}
      {value && !busy && (
        <p className="flex items-center gap-1.5 text-xs font-medium text-ok-strong">
          <HugeiconsIcon icon={Attachment01Icon} size={14} />
          {value.fileName}
        </p>
      )}
    </div>
  );
}
