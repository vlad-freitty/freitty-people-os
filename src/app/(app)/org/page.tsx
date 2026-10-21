import { getTranslations } from "next-intl/server";
import { DepartmentForm, HeadsEditor, NewCompanyForm, NewLocationForm } from "@/components/org-admin";
import { Card, PageTitle } from "@/components/ui";
import { getActor } from "@/server/auth/session";
import { scopeOf } from "@/server/authz/policy";
import { listEmployees } from "@/server/services/employees";
import { getOrgStructure } from "@/server/services/org";

type Dept = Awaited<ReturnType<typeof getOrgStructure>>["departments"][number];

export default async function OrgPage() {
  const actor = await getActor();
  const canManage = scopeOf(actor, "org.manage") === "all";
  const [org, people, t] = await Promise.all([getOrgStructure(actor), canManage ? listEmployees(actor) : [], getTranslations()]);
  const peopleOptions = people.map((p) => ({ id: p.id, label: `${p.lastName} ${p.firstName} · ${p.department.name}` }));

  const tree = (companyId: string, parentId: string | null, depth: number): React.ReactNode =>
    org.departments
      .filter((d) => d.companyId === companyId && d.parentId === parentId)
      .map((d) => (
        <div key={d.id}>
          <DepartmentRow d={d} depth={depth} />
          {tree(companyId, d.id, depth + 1)}
        </div>
      ));

  function DepartmentRow({ d, depth }: { d: Dept; depth: number }) {
    return (
      <details className="group border-b border-line/70 py-2" style={{ paddingLeft: depth * 20 }}>
        <summary className="flex cursor-pointer list-none flex-wrap items-baseline justify-between gap-2">
          <span className="font-medium">
            {depth > 0 && <span className="mr-1 text-ink-mute">↳</span>}
            {d.name}
          </span>
          <span className="text-xs text-ink-soft">
            {t("org.heads")}: {d.heads.length ? d.heads.map((h) => h.name).join(", ") : t("common.none")} · {t("org.employeeCount")}: {d.employeeCount}
          </span>
        </summary>
        {canManage && (
          <div className="mt-3 grid gap-4 rounded-xl bg-cream/60 p-4 lg:grid-cols-2">
            <DepartmentForm companies={org.companies} departments={org.departments} initial={d} />
            <HeadsEditor department={d} people={peopleOptions} />
          </div>
        )}
      </details>
    );
  }

  return (
    <>
      <PageTitle>{t("org.title")}</PageTitle>
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          {org.companies.map((c) => (
            <Card key={c.id} title={`${c.name} · ${c.country}`}>
              {tree(c.id, null, 0)}
            </Card>
          ))}
          {canManage && (
            <Card title={t("org.newDepartment")}>
              <DepartmentForm companies={org.companies} departments={org.departments} />
            </Card>
          )}
        </div>
        <div className="space-y-6">
          <Card title={t("org.locations")}>
            <ul className="mb-4 space-y-2 text-sm">
              {org.locations.map((l) => (
                <li key={l.id} className="flex justify-between gap-2 border-b border-line/70 pb-2">
                  <span className="font-medium">{l.name}</span>
                  <span className="text-ink-soft">
                    {[l.state, l.country].filter(Boolean).join(", ")} · {l.timezone}
                  </span>
                </li>
              ))}
            </ul>
            {canManage && <NewLocationForm />}
          </Card>
          {canManage && (
            <Card title={t("org.newCompany")}>
              <NewCompanyForm />
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
