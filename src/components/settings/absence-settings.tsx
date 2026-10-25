"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { api } from "../api";
import { ErrorBox } from "../error-box";
import { useModalClose } from "../overlay";
import { Button, Field } from "../ui";

function useRun() {
  const router = useRouter();
  const [error, setError] = useState<unknown>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<unknown>, after?: () => void) =>
    start(async () => {
      setError(null);
      try {
        await fn();
        after?.();
        router.refresh();
      } catch (err) {
        setError(err);
      }
    });
  return { error, pending, run };
}

/** Checkbox as a bordered row — easier to hit and to read than a bare box. */
export function Toggle({ checked, onChange, children }: { checked: boolean; onChange: (on: boolean) => void; children: React.ReactNode }) {
  return (
    <label className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-2.5 text-sm transition ${checked ? "border-ink/30 bg-cream font-medium text-ink-2" : "border-line text-ink-soft hover:bg-cream"}`}>
      <input type="checkbox" className="size-4 accent-red" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  );
}

/** Colour picker + its hex code in one pill. */
export function ColorInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <span className="field flex! items-center gap-2 py-1.5!">
      <input type="color" className="size-7 shrink-0 cursor-pointer rounded-full border-0 bg-transparent p-0" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} />
      <span className="font-mono text-xs text-ink-soft">{value}</span>
    </span>
  );
}

/** Cancel / save row at the bottom of a dialog form. */
export function DialogActions({ pending, label }: { pending: boolean; label: string }) {
  const tc = useTranslations("common");
  const close = useModalClose();
  return (
    <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
      {close && (
        <Button type="button" variant="secondary" onClick={close}>
          {tc("cancel")}
        </Button>
      )}
      <Button disabled={pending}>{label}</Button>
    </div>
  );
}

export type AbsenceTypeDto = {
  id: string;
  code: string;
  nameUk: string;
  nameEn: string | null;
  color: string;
  paid: boolean;
  deductsBalance: boolean;
  requiresDocument: boolean;
  requiresApproval: boolean;
  minDays: number | null;
  maxDays: number | null;
  allowHalfDay: boolean;
  countsAsWorking: boolean;
};

const FLAGS = [
  ["paid", "paid"],
  ["deductsBalance", "deducts"],
  ["requiresDocument", "requiresDocument"],
  ["requiresApproval", "requiresApproval"],
  ["allowHalfDay", "halfDay"],
  ["countsAsWorking", "countsAsWorking"],
] as const;

export function AbsenceTypeForm({ type }: { type?: AbsenceTypeDto }) {
  const t = useTranslations("settings");
  const close = useModalClose();
  const { error, pending, run } = useRun();
  const [v, setV] = useState({
    code: type?.code ?? "",
    nameUk: type?.nameUk ?? "",
    nameEn: type?.nameEn ?? "",
    color: type?.color ?? "#1f7a4d",
    paid: type?.paid ?? true,
    deductsBalance: type?.deductsBalance ?? false,
    requiresDocument: type?.requiresDocument ?? false,
    requiresApproval: type?.requiresApproval ?? true,
    allowHalfDay: type?.allowHalfDay ?? false,
    countsAsWorking: type?.countsAsWorking ?? false,
    minDays: type?.minDays?.toString() ?? "",
    maxDays: type?.maxDays?.toString() ?? "",
  });
  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        const body = { ...v, nameEn: v.nameEn || null, minDays: v.minDays ? Number(v.minDays) : null, maxDays: v.maxDays ? Number(v.maxDays) : null };
        run(() => (type ? api(`/settings/absence-types/${type.id}`, { method: "PATCH", body }) : api("/settings/absence-types", { body })), () => close?.());
      }}
    >
      <ErrorBox error={error} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("name")}>
          <input className="field" required autoFocus value={v.nameUk} onChange={(e) => setV({ ...v, nameUk: e.target.value })} />
        </Field>
        <Field label={t("nameEn")}>
          <input className="field" value={v.nameEn} onChange={(e) => setV({ ...v, nameEn: e.target.value })} />
        </Field>
        <Field label={t("code")}>
          <input className="field font-mono" required value={v.code} onChange={(e) => setV({ ...v, code: e.target.value })} disabled={!!type} />
        </Field>
        <Field label={t("color")}>
          <ColorInput value={v.color} onChange={(color) => setV({ ...v, color })} label={t("color")} />
        </Field>
        <Field label={t("minDays")}>
          <input className="field" type="number" step="0.5" min="0.5" value={v.minDays} onChange={(e) => setV({ ...v, minDays: e.target.value })} />
        </Field>
        <Field label={t("maxDays")}>
          <input className="field" type="number" step="0.5" min="0.5" value={v.maxDays} onChange={(e) => setV({ ...v, maxDays: e.target.value })} />
        </Field>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {FLAGS.map(([key, label]) => (
          <Toggle key={key} checked={v[key]} onChange={(on) => setV({ ...v, [key]: on })}>
            {t(label)}
          </Toggle>
        ))}
      </div>
      <DialogActions pending={pending} label={type ? t("commit") : t("newType")} />
    </form>
  );
}

export type PolicyDto = {
  id: string;
  name: string;
  absenceTypeId: string;
  isDefault: boolean;
  daysPerPeriod: number;
  accrual: "upfront" | "monthly";
  periodStart: "hire_date" | "jan_1" | "month";
  expiry: "end_of_period" | "months_after" | "never";
  expiryMonths: number | null;
  carryoverMax: number;
  availableAfterDays: number;
  allowNegative: boolean;
  countDays: "working" | "calendar";
  employeeCount: number;
};

export function PolicyForm({ policy, types }: { policy?: PolicyDto; types: { id: string; name: string }[] }) {
  const t = useTranslations("settings");
  const close = useModalClose();
  const { error, pending, run } = useRun();
  const [v, setV] = useState({
    name: policy?.name ?? "",
    absenceTypeId: policy?.absenceTypeId ?? types[0]?.id ?? "",
    isDefault: policy?.isDefault ?? false,
    daysPerPeriod: String(policy?.daysPerPeriod ?? 10),
    accrual: policy?.accrual ?? "upfront",
    periodStart: policy?.periodStart ?? "hire_date",
    expiry: policy?.expiry ?? "end_of_period",
    expiryMonths: String(policy?.expiryMonths ?? 3),
    carryoverMax: String(policy?.carryoverMax ?? 0),
    availableAfterDays: String(policy?.availableAfterDays ?? 0),
    allowNegative: policy?.allowNegative ?? false,
    countDays: policy?.countDays ?? "working",
  });
  const sel = <K extends keyof typeof v>(k: K, opts: readonly string[], ns: string) => (
    <select className="field" value={v[k] as string} onChange={(e) => setV({ ...v, [k]: e.target.value })}>
      {opts.map((o) => (
        <option key={o} value={o}>
          {t(`${ns}.${o}` as "accruals.upfront")}
        </option>
      ))}
    </select>
  );
  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        const body = {
          ...v,
          daysPerPeriod: Number(v.daysPerPeriod),
          expiryMonths: v.expiry === "months_after" ? Number(v.expiryMonths) : null,
          carryoverMax: Number(v.carryoverMax),
          availableAfterDays: Number(v.availableAfterDays),
        };
        run(() => (policy ? api(`/settings/policies/${policy.id}`, { method: "PATCH", body }) : api("/settings/policies", { body })), () => close?.());
      }}
    >
      <ErrorBox error={error} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("name")}>
          <input className="field" required autoFocus value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
        </Field>
        <Field label={t("policyType")}>
          <select className="field" value={v.absenceTypeId} disabled={!!policy} onChange={(e) => setV({ ...v, absenceTypeId: e.target.value })}>
            {types.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("daysPerPeriod")}>
          <input className="field" type="number" step="0.5" min="0" value={v.daysPerPeriod} onChange={(e) => setV({ ...v, daysPerPeriod: e.target.value })} />
        </Field>
        <Field label={t("accrual")}>{sel("accrual", ["upfront", "monthly"], "accruals")}</Field>
        <Field label={t("periodStart")}>{sel("periodStart", ["hire_date", "jan_1", "month"], "periodStarts")}</Field>
        <Field label={t("expiry")}>{sel("expiry", ["end_of_period", "months_after", "never"], "expiries")}</Field>
        {v.expiry === "months_after" && (
          <Field label={t("expiryMonths")}>
            <input className="field" type="number" min="1" value={v.expiryMonths} onChange={(e) => setV({ ...v, expiryMonths: e.target.value })} />
          </Field>
        )}
        <Field label={t("carryoverMax")}>
          <input className="field" type="number" step="0.5" min="0" value={v.carryoverMax} onChange={(e) => setV({ ...v, carryoverMax: e.target.value })} />
        </Field>
        <Field label={t("availableAfter")}>
          <input className="field" type="number" min="0" value={v.availableAfterDays} onChange={(e) => setV({ ...v, availableAfterDays: e.target.value })} />
        </Field>
        <Field label={t("countDays")}>{sel("countDays", ["working", "calendar"], "countDayModes")}</Field>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Toggle checked={v.isDefault} onChange={(on) => setV({ ...v, isDefault: on })}>
          {t("isDefault")}
        </Toggle>
        <Toggle checked={v.allowNegative} onChange={(on) => setV({ ...v, allowNegative: on })}>
          {t("allowNegative")}
        </Toggle>
      </div>
      <DialogActions pending={pending} label={policy ? t("commit") : t("newPolicy")} />
    </form>
  );
}

/** One cell: company / department / person × absence type → policy select ("inherit" = the next level / default). */
export function PolicyAssign({
  targetType,
  targetId,
  absenceTypeId,
  label,
  current,
  policies,
}: {
  targetType: "company" | "department" | "employee";
  targetId: string;
  absenceTypeId: string;
  label: string;
  current: string | null;
  policies: { id: string; name: string }[];
}) {
  const t = useTranslations("settings");
  const { error, pending, run } = useRun();
  return (
    <div className="min-w-40">
      <select
        className="field py-1!"
        disabled={pending}
        value={current ?? ""}
        aria-label={label}
        onChange={(e) =>
          run(() => api("/settings/policy-assignment", { method: "PUT", body: { targetType, targetId, absenceTypeId, policyId: e.target.value || null } }))
        }
      >
        <option value="">{t("inheritPolicy")}</option>
        {policies.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <ErrorBox error={error} />
    </div>
  );
}
