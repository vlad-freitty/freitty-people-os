"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { api, ApiRequestError } from "./api";
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

type Location = { id: string; name: string; country: string; state: string | null; timezone: string };

export function NewLocationForm({ initial, onDone }: { initial?: Location; onDone?: () => void } = {}) {
  const t = useTranslations();
  const { error, pending, run } = useSubmit();
  const [v, setV] = useState({ name: initial?.name ?? "", country: initial?.country ?? "", state: initial?.state ?? "", timezone: initial?.timezone ?? "" });
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
          () =>
            initial
              ? api(`/locations/${initial.id}`, { method: "PATCH", body: { ...v, state: v.state || null } })
              : api("/locations", { body: { ...v, state: v.state || null } }),
          () => (initial ? onDone?.() : setV({ name: "", country: "", state: "", timezone: "" })),
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
      <Button disabled={pending}>{initial ? t("common.save") : t("org.newLocation")}</Button>
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
      {initial && (
        <div className="border-t border-line pt-3">
          <DeleteOrgButton path={`/departments/${initial.id}`} confirmText={t("org.confirmDeleteDepartment", { name: initial.name })} label={t("org.deleteDepartment")} />
        </div>
      )}
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

/** "has_people_3" → a readable reason why the record cannot be removed yet. */
function deleteReason(err: unknown, t: ReturnType<typeof useTranslations>) {
  if (!(err instanceof ApiRequestError)) return null;
  const details = (err.error.details ?? {}) as Record<string, string>;
  const code = Object.values(details)[0];
  if (typeof code !== "string") return null;
  const m = /^(has_people|has_departments|has_subdepartments)(?:_(\d+))?$/.exec(code);
  return m ? t(`org.cannotDelete.${m[1]}` as "org.cannotDelete.has_people", { n: Number(m[2] ?? 0) }) : null;
}

/** Delete with a confirmation; a refusal (people or sub-units still inside) is explained in words. */
export function DeleteOrgButton({ path, confirmText, label }: { path: string; confirmText: string; label: string }) {
  const t = useTranslations();
  const { error, pending, run } = useSubmit();
  const reason = deleteReason(error, t);
  return (
    <div className="space-y-2">
      {reason ? <p className="rounded-xl bg-warn-tint px-3 py-2 text-sm text-warn">{reason}</p> : <ErrorBox error={error} />}
      <Button
        type="button"
        variant="danger"
        disabled={pending}
        onClick={() => {
          if (window.confirm(confirmText)) run(() => api(path, { method: "DELETE" }));
        }}
      >
        {label}
      </Button>
    </div>
  );
}

/** Company card actions: rename / change country, remove. */
export function CompanyActions({ company }: { company: { id: string; name: string; country: string } }) {
  const t = useTranslations();
  const { error, pending, run } = useSubmit();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(company.name);
  const [country, setCountry] = useState(company.country);
  if (!open) {
    return (
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        {t("common.edit")}
      </Button>
    );
  }
  return (
    <div className="w-full space-y-3 rounded-xl bg-cream/60 p-4">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => api(`/companies/${company.id}`, { method: "PATCH", body: { name, country } }), () => setOpen(false));
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
        <div className="flex flex-wrap gap-2">
          <Button disabled={pending}>{t("common.save")}</Button>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            {t("common.cancel")}
          </Button>
        </div>
      </form>
      <div className="border-t border-line pt-3">
        <DeleteOrgButton path={`/companies/${company.id}`} confirmText={t("org.confirmDeleteCompany", { name: company.name })} label={t("org.deleteCompany")} />
      </div>
    </div>
  );
}

/** One location in the list; managers can edit or remove it. */
export function LocationRow({ location, canManage }: { location: Location; canManage: boolean }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  return (
    <li className="border-b border-line/70 pb-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{location.name}</span>
        <span className="flex items-center gap-2 text-ink-soft">
          {[location.state, location.country].filter(Boolean).join(", ")} · {location.timezone}
          {canManage && !open && (
            <button type="button" className="text-xs font-medium text-red hover:text-red-strong" onClick={() => setOpen(true)}>
              {t("common.edit")}
            </button>
          )}
        </span>
      </div>
      {open && (
        <div className="mt-3 space-y-3 rounded-xl bg-cream/60 p-4">
          <NewLocationForm initial={location} onDone={() => setOpen(false)} />
          <div className="flex flex-wrap items-start justify-between gap-2 border-t border-line pt-3">
            <DeleteOrgButton path={`/locations/${location.id}`} confirmText={t("org.confirmDeleteLocation", { name: location.name })} label={t("org.deleteLocation")} />
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
