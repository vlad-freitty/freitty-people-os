"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { api } from "../api";
import { ErrorBox } from "../error-box";
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
      className="space-y-2 rounded-xl border border-line p-3"
      onSubmit={(e) => {
        e.preventDefault();
        const body = { ...v, nameEn: v.nameEn || null, minDays: v.minDays ? Number(v.minDays) : null, maxDays: v.maxDays ? Number(v.maxDays) : null };
        run(() => (type ? api(`/settings/absence-types/${type.id}`, { method: "PATCH", body }) : api("/settings/absence-types", { body })));
      }}
    >
      <ErrorBox error={error} />
      <div className="grid gap-2 sm:grid-cols-[1fr_2fr_2fr_auto_1fr_1fr]">
        <input className="field font-mono text-xs" required placeholder={t("code")} value={v.code} onChange={(e) => setV({ ...v, code: e.target.value })} disabled={!!type} />
        <input className="field" required placeholder={t("name")} value={v.nameUk} onChange={(e) => setV({ ...v, nameUk: e.target.value })} />
        <input className="field" placeholder={t("nameEn")} value={v.nameEn} onChange={(e) => setV({ ...v, nameEn: e.target.value })} />
        <input className="field h-10 w-14 p-1" type="color" value={v.color} onChange={(e) => setV({ ...v, color: e.target.value })} aria-label={t("color")} />
        <input className="field" type="number" step="0.5" min="0.5" placeholder={t("minDays")} value={v.minDays} onChange={(e) => setV({ ...v, minDays: e.target.value })} />
        <input className="field" type="number" step="0.5" min="0.5" placeholder={t("maxDays")} value={v.maxDays} onChange={(e) => setV({ ...v, maxDays: e.target.value })} />
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        {FLAGS.map(([key, label]) => (
          <label key={key} className="flex items-center gap-1.5">
            <input type="checkbox" checked={v[key]} onChange={(e) => setV({ ...v, [key]: e.target.checked })} />
            {t(label)}
          </label>
        ))}
      </div>
      <Button disabled={pending} variant={type ? "secondary" : "primary"}>
        {type ? t("commit") : t("newType")}
      </Button>
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
      className="space-y-3 rounded-xl border border-line p-3"
      onSubmit={(e) => {
        e.preventDefault();
        const body = {
          ...v,
          daysPerPeriod: Number(v.daysPerPeriod),
          expiryMonths: v.expiry === "months_after" ? Number(v.expiryMonths) : null,
          carryoverMax: Number(v.carryoverMax),
          availableAfterDays: Number(v.availableAfterDays),
        };
        run(() => (policy ? api(`/settings/policies/${policy.id}`, { method: "PATCH", body }) : api("/settings/policies", { body })));
      }}
    >
      <ErrorBox error={error} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={t("name")}>
          <input className="field" required value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
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
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={v.isDefault} onChange={(e) => setV({ ...v, isDefault: e.target.checked })} />
          {t("isDefault")}
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={v.allowNegative} onChange={(e) => setV({ ...v, allowNegative: e.target.checked })} />
          {t("allowNegative")}
        </label>
      </div>
      <Button disabled={pending} variant={policy ? "secondary" : "primary"}>
        {policy ? t("commit") : t("newPolicy")}
      </Button>
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
        className="field py-1"
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
