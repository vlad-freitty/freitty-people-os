import { Add01Icon, Building03Icon, HierarchyIcon, Location01Icon, PencilEdit02Icon, UserGroupIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { getTranslations } from "next-intl/server";
import { CompanyForm, DepartmentEditor, DepartmentForm, LocationForm } from "@/components/org-admin";
import { ModalButton } from "@/components/overlay";
import { Badge, Card, EmptyState, IconTile, PageTitle } from "@/components/ui";
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
        <li key={d.id}>
          <DepartmentRow d={d} depth={depth} />
          <ul>{tree(companyId, d.id, depth + 1)}</ul>
        </li>
      ));

  function DepartmentRow({ d, depth }: { d: Dept; depth: number }) {
    return (
      <div className="flex items-center gap-3 border-b border-line py-3" style={{ paddingLeft: depth * 28 }}>
        {depth > 0 ? (
          <span className="h-5 w-3 shrink-0 rounded-bl-md border-b-2 border-l-2 border-line-strong" aria-hidden />
        ) : (
          <IconTile icon={HierarchyIcon} tone="blue" size={32} />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold text-ink-2">{d.name}</p>
          <p className="truncate text-xs text-ink-mute">
            {d.heads.length ? `${t("org.heads")}: ${d.heads.map((h) => h.name).join(", ")}` : <span className="text-warn">{t("org.noHead")}</span>}
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-cream px-2.5 py-1 text-xs font-medium text-ink-soft" title={t("org.employeeCount")}>
          <HugeiconsIcon icon={UserGroupIcon} size={14} />
          {d.employeeCount}
        </span>
        {canManage && (
          <ModalButton iconOnly icon={PencilEdit02Icon} label={t("common.edit")} title={d.name} subtitle={t("org.departmentDialog")} modalIcon={HierarchyIcon} size="lg">
            <DepartmentEditor companies={org.companies} departments={org.departments} department={d} people={peopleOptions} />
          </ModalButton>
        )}
      </div>
    );
  }

  const newDepartment = (companyId?: string, variant: "primary" | "secondary" | "ghost" = "primary") => (
    <ModalButton label={t("org.newDepartment")} icon={Add01Icon} variant={variant} title={t("org.newDepartment")} modalIcon={HierarchyIcon}>
      <DepartmentForm companies={org.companies} departments={org.departments} companyId={companyId} />
    </ModalButton>
  );

  return (
    <>
      <PageTitle
        subtitle={t("org.subtitle")}
        actions={
          canManage && (
            <>
              <ModalButton label={t("org.newCompany")} icon={Building03Icon} variant="secondary" title={t("org.newCompany")}>
                <CompanyForm />
              </ModalButton>
              {org.companies.length > 0 && newDepartment()}
            </>
          )
        }
      >
        {t("org.title")}
      </PageTitle>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          {org.companies.length === 0 && <EmptyState icon={Building03Icon} title={t("org.noCompanies")} hint={t("org.noCompaniesHint")} />}
          {org.companies.map((c) => {
            const depts = org.departments.filter((d) => d.companyId === c.id);
            const headcount = depts.reduce((s, d) => s + d.employeeCount, 0);
            return (
              <Card
                key={c.id}
                icon={Building03Icon}
                title={
                  <span className="flex items-center gap-2">
                    {c.name} <Badge>{c.country}</Badge>
                  </span>
                }
                subtitle={t("org.companySummary", { departments: depts.length, people: headcount })}
                actions={
                  canManage && (
                    <>
                      {depts.length > 0 && newDepartment(c.id, "ghost")}
                      <ModalButton iconOnly icon={PencilEdit02Icon} label={t("common.edit")} title={c.name} subtitle={t("org.companyDialog")} modalIcon={Building03Icon}>
                        <CompanyForm initial={c} />
                      </ModalButton>
                    </>
                  )
                }
              >
                {depts.length ? (
                  <ul className="-mb-3 border-t border-line">{tree(c.id, null, 0)}</ul>
                ) : (
                  <EmptyState icon={HierarchyIcon} title={t("org.noDepartments")} hint={t("org.noDepartmentsHint")} action={canManage && newDepartment(c.id)} />
                )}
              </Card>
            );
          })}
        </div>

        <Card
          icon={Location01Icon}
          title={t("org.locations")}
          subtitle={t("org.locationsHint")}
          className="self-start"
          actions={
            canManage && (
              <ModalButton iconOnly icon={Add01Icon} label={t("org.newLocation")} title={t("org.newLocation")} modalIcon={Location01Icon}>
                <LocationForm />
              </ModalButton>
            )
          }
        >
          {org.locations.length ? (
            <ul className="divide-y divide-line border-t border-line">
              {org.locations.map((l) => (
                <li key={l.id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-ink-2">{l.name}</p>
                    <p className="truncate text-xs text-ink-mute">
                      {[[l.state, l.country].filter(Boolean).join(", "), l.timezone].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  {canManage && (
                    <ModalButton iconOnly icon={PencilEdit02Icon} label={t("common.edit")} title={l.name} modalIcon={Location01Icon}>
                      <LocationForm initial={l} />
                    </ModalButton>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={Location01Icon} title={t("org.noLocations")} />
          )}
        </Card>
      </div>
    </>
  );
}
