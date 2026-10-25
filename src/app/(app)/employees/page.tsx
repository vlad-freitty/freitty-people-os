import { BirthdayCakeIcon, Search01Icon, UserAdd01Icon, UserGroupIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { sectionIcons } from "@/components/icons";
import { Avatar, Badge, buttonClass, Card, EmptyState, LinkButton, PageTitle, statusTone } from "@/components/ui";
import { formatMonthDay } from "@/lib/format";
import { getActor } from "@/server/auth/session";
import { scopeOf } from "@/server/authz/policy";
import { listEmployees } from "@/server/services/employees";
import { getOrgStructure } from "@/server/services/org";

const STATUSES = ["candidate", "onboarding", "active", "offboarding", "left"] as const;

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await getActor();
  const sp = await searchParams;
  const query = Object.fromEntries(Object.entries(sp).filter(([, v]) => v));
  const [employees, org] = await Promise.all([listEmployees(actor, query), getOrgStructure(actor)]);
  const t = await getTranslations();
  const locale = await getLocale();
  const companyName = new Map(org.companies.map((c) => [c.id, c.name]));
  const canCreate = scopeOf(actor, "employees.edit") && scopeOf(actor, "employees.edit") !== "self";

  // status pills keep the other filters
  const statusHref = (status?: string) => {
    const params = new URLSearchParams(Object.entries({ ...query, status }).filter((e): e is [string, string] => !!e[1]));
    const s = params.toString();
    return s ? `/employees?${s}` : "/employees";
  };
  const pill = (active: boolean) =>
    `inline-flex h-9 items-center rounded-full border px-3.5 text-sm font-medium whitespace-nowrap transition ${
      active ? "border-navy bg-navy text-white" : "border-line-strong bg-paper text-ink-soft hover:bg-cream hover:text-ink"
    }`;

  return (
    <>
      <PageTitle
        icon={sectionIcons.employees}
        subtitle={t("people2.listSubtitle")}
        actions={
          canCreate && (
            <LinkButton href="/employees/new">
              <HugeiconsIcon icon={UserAdd01Icon} size={18} />
              {t("employees.new")}
            </LinkButton>
          )
        }
      >
        {t("employees.title")}
      </PageTitle>

      <Card className="mb-5">
        <form className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto]">
          {sp.status && <input type="hidden" name="status" value={sp.status} />}
          <label className="relative block">
            <HugeiconsIcon icon={Search01Icon} size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-mute" />
            <input name="q" defaultValue={sp.q} placeholder={t("employees.searchPlaceholder")} className="field pl-9!" aria-label={t("common.search")} />
          </label>
          <select name="companyId" defaultValue={sp.companyId ?? ""} className="field" aria-label={t("employees.filterCompany")}>
            <option value="">
              {t("employees.filterCompany")}: {t("common.all")}
            </option>
            {org.companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select name="departmentId" defaultValue={sp.departmentId ?? ""} className="field" aria-label={t("employees.filterDepartment")}>
            <option value="">
              {t("employees.filterDepartment")}: {t("common.all")}
            </option>
            {org.departments.map((d) => (
              <option key={d.id} value={d.id}>
                {companyName.get(d.companyId)} · {d.name}
              </option>
            ))}
          </select>
          <button className={buttonClass("secondary")}>
            <HugeiconsIcon icon={Search01Icon} size={16} />
            {t("common.search")}
          </button>
        </form>
        <nav aria-label={t("employees.filterStatus")} className="mt-4 flex gap-2 overflow-x-auto border-t border-line pt-4">
          <Link href={statusHref(undefined)} className={pill(!sp.status)}>
            {t("common.all")}
          </Link>
          {STATUSES.map((s) => (
            <Link key={s} href={statusHref(s)} className={pill(sp.status === s)}>
              {t(`status.${s}`)}
            </Link>
          ))}
        </nav>
      </Card>

      <Card icon={UserGroupIcon} tone="blue" title={t("employees.title")} subtitle={t("employees.count", { count: employees.length })}>
        {employees.length === 0 ? (
          <EmptyState icon={UserGroupIcon} title={t("common.noResults")} hint={t("people2.noResultsHint")} />
        ) : (
          <div className="-mx-5 overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th className="pl-5!">{t("employee.name")}</th>
                  <th>{t("employee.department")}</th>
                  <th className="hidden md:table-cell">{t("employee.workEmail")}</th>
                  <th className="pr-5!">{t("employee.status")}</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((e) => (
                  <tr key={e.id} className="hover:bg-cream/60">
                    <td className="pl-5!">
                      <Link href={`/employees/${e.id}`} className="group flex items-center gap-3">
                        {e.photo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={e.photo} alt="" className="size-9 shrink-0 rounded-full object-cover" />
                        ) : (
                          <Avatar name={`${e.firstName} ${e.lastName}`} muted={e.access !== "basic" && e.status === "left"} />
                        )}
                        <span className="min-w-0">
                          <span className="block font-bold text-ink-2 group-hover:text-red">
                            {e.lastName} {e.firstName}
                          </span>
                          <span className="block text-xs text-ink-mute">{e.position}</span>
                          {e.access === "basic" && e.birthday && (
                            <span className="mt-0.5 flex items-center gap-1 text-xs text-ink-mute">
                              <HugeiconsIcon icon={BirthdayCakeIcon} size={13} className="text-red" />
                              {formatMonthDay(e.birthday, locale)}
                            </span>
                          )}
                        </span>
                      </Link>
                    </td>
                    <td>
                      <span className="block text-ink-2">{e.department.name}</span>
                      <span className="block text-xs text-ink-mute">{e.company.name}</span>
                    </td>
                    <td className="hidden text-ink-soft md:table-cell">{e.workEmail}</td>
                    <td className="pr-5!">
                      {e.access === "basic" ? <Badge>{t("employees.accessBasic")}</Badge> : <Badge tone={statusTone[e.status]}>{t(`status.${e.status}`)}</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
