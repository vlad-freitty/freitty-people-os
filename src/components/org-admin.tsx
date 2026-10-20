"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { api } from "./api";
import { ErrorBox } from "./error-box";
import { Button, Field } from "./ui";

type Company = { id: string; name: string };
type Department = { id: string; companyId: string; name: string; parentId: string | null; heads: { id: string; name: string }[] };
type Person = { id: string; label: string };

function useSubmit() {
  const router = useRouter();
  const [error, setError] = useState<unknown>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<unknown>, after?: () => void) => {
    setError(null);
    start(async () => {
      try {
        await fn();
        after?.();
        router.refresh();
      } catch (err) {
        setError(err);
      }
    });
  };
  return { error, pending, run };
}

export function NewCompanyForm() {
  const t = useTranslations();
  const { error, pending, run } = useSubmit();
  const [name, setName] = useState("");
  const [country, setCountry] = useState("");
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => api("/companies", { body: { name, country } }), () => (setName(""), setCountry("")));
      }}
    >
      <ErrorBox error={error} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("org.name")}>
          <input className="field" required value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t("org.country")}>
          <input className="field" required value={country} onChange={(e) => setCountry(e.target.value)} />
        </Field>
      </div>
      <Button disabled={pending}>{t("org.newCompany")}</Button>
    </form>
  );
}

export function NewLocationForm() {
  const t = useTranslations();
  const { error, pending, run } = useSubmit();
  const [v, setV] = useState({ name: "", country: "", state: "", timezone: "" });
  const bind = (k: keyof typeof v) => ({
    value: v[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setV((s) => ({ ...s, [k]: e.target.value })),
    className: "field",
  });
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () => api("/locations", { body: { ...v, state: v.state || null } }),
          () => setV({ name: "", country: "", state: "", timezone: "" }),
        );
      }}
    >
      <ErrorBox error={error} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("org.name")}>
          <input required {...bind("name")} />
        </Field>
        <Field label={t("org.country")}>
          <input required {...bind("country")} />
        </Field>
        <Field label={t("org.state")}>
          <input {...bind("state")} />
        </Field>
        <Field label={t("org.timezone")}>
          <input required placeholder="Europe/Kyiv" {...bind("timezone")} />
        </Field>
      </div>
      <Button disabled={pending}>{t("org.newLocation")}</Button>
    </form>
  );
}

export function DepartmentForm({ companies, departments, initial }: { companies: Company[]; departments: Department[]; initial?: Department }) {
  const t = useTranslations();
  const { error, pending, run } = useSubmit();
  const [companyId, setCompanyId] = useState(initial?.companyId ?? companies[0]?.id ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [parentId, setParentId] = useState(initial?.parentId ?? "");
  const parents = departments.filter((d) => d.companyId === companyId && d.id !== initial?.id);
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const body = { companyId, name, parentId: parentId || null };
        run(
          () => (initial ? api(`/departments/${initial.id}`, { method: "PATCH", body }) : api("/departments", { body })),
          () => !initial && (setName(""), setParentId("")),
        );
      }}
    >
      <ErrorBox error={error} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={t("employee.company")}>
          <select className="field" value={companyId} disabled={!!initial} onChange={(e) => (setCompanyId(e.target.value), setParentId(""))}>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("org.name")}>
          <input className="field" required value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t("org.parent")}>
          <select className="field" value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">{t("org.noParent")}</option>
            {parents.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Button disabled={pending}>{initial ? t("common.save") : t("org.newDepartment")}</Button>
    </form>
  );
}

export function HeadsEditor({ department, people }: { department: Department; people: Person[] }) {
  const t = useTranslations();
  const { error, pending, run } = useSubmit();
  const [selected, setSelected] = useState<string[]>(department.heads.map((h) => h.id));
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => api(`/departments/${department.id}/heads`, { method: "PUT", body: { employeeIds: selected } }));
      }}
    >
      <ErrorBox error={error} />
      <Field label={`${t("org.headsEdit")} · ${t("org.selectHeads")}`}>
        <select
          multiple
          className="field h-40"
          value={selected}
          onChange={(e) => setSelected(Array.from(e.target.selectedOptions).map((o) => o.value))}
        >
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </Field>
      <Button disabled={pending}>{t("common.save")}</Button>
    </form>
  );
}
