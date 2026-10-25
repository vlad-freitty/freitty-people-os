"use client";

import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { api, ApiRequestError } from "./api";
import { ErrorBox } from "./error-box";
import { useModalClose } from "./overlay";
import { Button, Field } from "./ui";

type Company = { id: string; name: string };
type Department = { id: string; companyId: string; name: string; parentId: string | null; heads: { id: string; name: string }[] };
type Person = { id: string; label: string };
type Location = { id: string; name: string; country: string; state: string | null; timezone: string };

/** Runs a mutation, refreshes the page and closes the surrounding dialog (if any). */
function useSubmit() {
  const router = useRouter();
  const close = useModalClose();
  const [error, setError] = useState<unknown>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<unknown>, after?: () => void, keepOpen = false) => {
    setError(null);
    start(async () => {
      try {
        await fn();
        after?.();
        router.refresh();
        if (!keepOpen) close?.();
      } catch (err) {
        setError(err);
      }
    });
  };
  return { error, pending, run };
}

/** Save / cancel row at the bottom of a dialog form. */
function FormActions({ pending, label }: { pending: boolean; label: string }) {
  const t = useTranslations("common");
  const close = useModalClose();
  return (
    <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
      {close && (
        <Button type="button" variant="secondary" onClick={close}>
          {t("cancel")}
        </Button>
      )}
      <Button disabled={pending}>{label}</Button>
    </div>
  );
}

/** Removal sits apart from the form, under a divider. */
function DangerZone({ children }: { children: ReactNode }) {
  const t = useTranslations("org");
  return (
    <div className="mt-6 space-y-2 rounded-2xl border border-red/20 bg-red-tint/40 p-4">
      <p className="text-sm font-bold text-red">{t("dangerZone")}</p>
      <p className="text-xs text-ink-soft">{t("dangerHint")}</p>
      {children}
    </div>
  );
}

export function CompanyForm({ initial }: { initial?: { id: string; name: string; country: string } }) {
  const t = useTranslations();
  const { error, pending, run } = useSubmit();
  const [name, setName] = useState(initial?.name ?? "");
  const [country, setCountry] = useState(initial?.country ?? "");
  return (
    <>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => (initial ? api(`/companies/${initial.id}`, { method: "PATCH", body: { name, country } }) : api("/companies", { body: { name, country } })));
        }}
      >
        <ErrorBox error={error} />
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
          <Field label={t("org.name")}>
            <input className="field" required autoFocus value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label={t("org.country")}>
            <input className="field" required placeholder="US" value={country} onChange={(e) => setCountry(e.target.value)} />
          </Field>
        </div>
        <FormActions pending={pending} label={initial ? t("common.save") : t("org.newCompany")} />
      </form>
      {initial && (
        <DangerZone>
          <DeleteOrgButton path={`/companies/${initial.id}`} confirmText={t("org.confirmDeleteCompany", { name: initial.name })} label={t("org.deleteCompany")} />
        </DangerZone>
      )}
    </>
  );
}

export function LocationForm({ initial }: { initial?: Location }) {
  const t = useTranslations();
  const { error, pending, run } = useSubmit();
  const [v, setV] = useState({ name: initial?.name ?? "", country: initial?.country ?? "", state: initial?.state ?? "", timezone: initial?.timezone ?? "" });
  const bind = (k: keyof typeof v) => ({
    value: v[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setV((s) => ({ ...s, [k]: e.target.value })),
    className: "field",
  });
  return (
    <>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const body = { ...v, state: v.state || null };
          run(() => (initial ? api(`/locations/${initial.id}`, { method: "PATCH", body }) : api("/locations", { body })));
        }}
      >
        <ErrorBox error={error} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("org.name")}>
            <input required autoFocus placeholder="Columbus, OH" {...bind("name")} />
          </Field>
          <Field label={t("org.country")}>
            <input required placeholder="US" {...bind("country")} />
          </Field>
          <Field label={t("org.state")}>
            <input placeholder="OH" {...bind("state")} />
          </Field>
          <Field label={t("org.timezone")}>
            <input required placeholder="America/New_York" {...bind("timezone")} />
          </Field>
        </div>
        <p className="text-xs text-ink-mute">{t("org.timezoneHint")}</p>
        <FormActions pending={pending} label={initial ? t("common.save") : t("org.newLocation")} />
      </form>
      {initial && (
        <DangerZone>
          <DeleteOrgButton path={`/locations/${initial.id}`} confirmText={t("org.confirmDeleteLocation", { name: initial.name })} label={t("org.deleteLocation")} />
        </DangerZone>
      )}
    </>
  );
}

export function DepartmentForm({
  companies,
  departments,
  initial,
  companyId: fixedCompany,
}: {
  companies: Company[];
  departments: Department[];
  initial?: Department;
  companyId?: string;
}) {
  const t = useTranslations();
  const { error, pending, run } = useSubmit();
  const [companyId, setCompanyId] = useState(initial?.companyId ?? fixedCompany ?? companies[0]?.id ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [parentId, setParentId] = useState(initial?.parentId ?? "");
  const parents = departments.filter((d) => d.companyId === companyId && d.id !== initial?.id);
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const body = { companyId, name, parentId: parentId || null };
        run(() => (initial ? api(`/departments/${initial.id}`, { method: "PATCH", body }) : api("/departments", { body })), undefined, !!initial);
      }}
    >
      <ErrorBox error={error} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("org.name")} className="sm:col-span-2">
          <input className="field" required autoFocus={!initial} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t("employee.company")}>
          <select className="field" value={companyId} disabled={!!initial} onChange={(e) => (setCompanyId(e.target.value), setParentId(""))}>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
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
      <FormActions pending={pending} label={initial ? t("common.save") : t("org.newDepartment")} />
    </form>
  );
}

/** Heads of a department: a searchable checklist instead of a multi-select. */
export function HeadsEditor({ department, people }: { department: Department; people: Person[] }) {
  const t = useTranslations();
  const { error, pending, run } = useSubmit();
  const [selected, setSelected] = useState<string[]>(department.heads.map((h) => h.id));
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  // chosen people first, then the rest alphabetically
  const list = people
    .filter((p) => !q || p.label.toLowerCase().includes(q))
    .sort((a, b) => Number(selected.includes(b.id)) - Number(selected.includes(a.id)));
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => api(`/departments/${department.id}/heads`, { method: "PUT", body: { employeeIds: selected } }), undefined, true);
      }}
    >
      <ErrorBox error={error} />
      <label className="relative block">
        <HugeiconsIcon icon={Search01Icon} size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-mute" />
        <input className="field pl-9!" value={query} placeholder={t("org.searchPeople")} onChange={(e) => setQuery(e.target.value)} aria-label={t("org.searchPeople")} />
      </label>
      <ul className="max-h-56 divide-y divide-line overflow-y-auto rounded-2xl border border-line">
        {list.map((p) => (
          <li key={p.id}>
            <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm hover:bg-cream">
              <input type="checkbox" className="size-4 accent-red" checked={selected.includes(p.id)} onChange={() => toggle(p.id)} />
              <span className={selected.includes(p.id) ? "font-bold text-ink-2" : "text-ink-soft"}>{p.label}</span>
            </label>
          </li>
        ))}
        {list.length === 0 && <li className="px-4 py-3 text-sm text-ink-mute">{t("common.noResults")}</li>}
      </ul>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-ink-mute">{t("org.selectedCount", { n: selected.length })}</span>
        <Button variant="secondary" disabled={pending}>
          {t("org.saveHeads")}
        </Button>
      </div>
    </form>
  );
}

/** Everything about one department in one dialog: name and parent, heads, removal. */
export function DepartmentEditor({ companies, departments, department, people }: { companies: Company[]; departments: Department[]; department: Department; people: Person[] }) {
  const t = useTranslations();
  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-3 text-sm font-bold text-ink-2">{t("org.basics")}</h3>
        <DepartmentForm companies={companies} departments={departments} initial={department} />
      </section>
      <section className="border-t border-line pt-5">
        <h3 className="mb-1 text-sm font-bold text-ink-2">{t("org.headsEdit")}</h3>
        <p className="mb-3 text-xs text-ink-mute">{t("org.headsHint")}</p>
        <HeadsEditor department={department} people={people} />
      </section>
      <DangerZone>
        <DeleteOrgButton path={`/departments/${department.id}`} confirmText={t("org.confirmDeleteDepartment", { name: department.name })} label={t("org.deleteDepartment")} />
      </DangerZone>
    </div>
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
