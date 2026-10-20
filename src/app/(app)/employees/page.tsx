import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Badge, buttonClass, LinkButton, PageTitle, statusTone } from "@/components/ui";
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

  return (
    <>
      <PageTitle actions={scopeOf(actor, "employees.edit") && scopeOf(actor, "employees.edit") !== "self" && <LinkButton href="/employees/new">{t("employees.new")}</LinkButton>}>
        {t("employees.title")}
      </PageTitle>

      <form className="mb-5 grid gap-3 rounded-xl border border-line bg-paper p-4 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]">
        <input name="q" defaultValue={sp.q} placeholder={t("employees.searchPlaceholder")} className="field" aria-label={t("common.search")} />
        <select name="companyId" defaultValue={sp.companyId ?? ""} className="field" aria-label={t("employees.filterCompany")}>
          <option value="">{t("employees.filterCompany")}: {t("common.all")}</option>
          {org.companies.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select name="departmentId" defaultValue={sp.departmentId ?? ""} className="field" aria-label={t("employees.filterDepartment")}>
          <option value="">{t("employees.filterDepartment")}: {t("common.all")}</option>
          {org.departments.map((d) => (
            <option key={d.id} value={d.id}>{companyName.get(d.companyId)} · {d.name}</option>
          ))}
        </select>
        <select name="status" defaultValue={sp.status ?? ""} className="field" aria-label={t("employees.filterStatus")}>
          <option value="">{t("employees.filterStatus")}: {t("common.all")}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{t(`status.${s}`)}</option>
          ))}
        </select>
        <button className={buttonClass("secondary")}>{t("common.search")}</button>
      </form>

      <p className="mb-2 text-sm text-ink-mute">{t("employees.count", { count: employees.length })}</p>
      <div className="overflow-x-auto rounded-xl border border-line bg-paper">
        <table className="table">
          <thead>
            <tr>
              <th>{t("employee.name")}</th>
              <th>{t("employee.position")}</th>
              <th>{t("employee.department")}</th>
              <th className="hidden md:table-cell">{t("employee.workEmail")}</th>
              <th>{t("employee.status")}</th>
            </tr>
          </thead>
          <tbody>
            {employees.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-ink-mute">{t("common.noResults")}</td>
              </tr>
            )}
            {employees.map((e) => (
              <tr key={e.id} className="hover:bg-cream/60">
                <td>
                  <Link href={`/employees/${e.id}`} className="font-medium hover:text-red">
                    {e.lastName} {e.firstName}
                  </Link>
                  {e.access === "basic" && e.birthday && (
                    <span className="block text-xs text-ink-mute">🎂 {formatMonthDay(e.birthday, locale)}</span>
                  )}
                </td>
                <td>{e.position}</td>
                <td>
                  {e.department.name}
                  <span className="block text-xs text-ink-mute">{e.company.name}</span>
                </td>
                <td className="hidden md:table-cell">{e.workEmail}</td>
                <td>
                  {e.access === "basic" ? (
                    <Badge>{t("employees.accessBasic")}</Badge>
                  ) : (
                    <Badge tone={statusTone[e.status]}>{t(`status.${e.status}`)}</Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
