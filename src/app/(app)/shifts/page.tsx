import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { ShiftForm, ShiftImport, ShiftsBoard } from "@/components/money/shifts-board";
import { buttonClass, Card, PageTitle } from "@/components/ui";
import { getActor } from "@/server/auth/session";
import { can, scopeOf } from "@/server/authz/policy";
import { isoWeekday, nextIso } from "@/server/calendar/core";
import { listEmployees } from "@/server/services/employees";
import { getOrgStructure } from "@/server/services/org";
import { listShifts } from "@/server/services/shifts";

export default async function ShiftsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; departmentId?: string }> }) {
  const actor = await getActor();
  const manage = scopeOf(actor, "shifts.manage");
  if (!manage && !scopeOf(actor, "employees.view")) notFound();
  const sp = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const monday = nextIso(today, -(isoWeekday(today) - 1));
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? "") ? sp.from! : monday;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(sp.to ?? "") ? sp.to! : nextIso(from, 6);
  const [shifts, org, people, t] = await Promise.all([
    listShifts(actor, { from, to, departmentId: sp.departmentId || undefined }),
    getOrgStructure(actor),
    manage ? listEmployees(actor) : Promise.resolve([]),
    getTranslations("shifts"),
  ]);
  const companyName = new Map(org.companies.map((c) => [c.id, c.name]));
  const departments = org.departments
    .filter((d) => manage === "all" || can(actor, "shifts.manage", { departmentId: d.id }))
    .map((d) => ({ id: d.id, companyId: d.companyId, label: `${companyName.get(d.companyId)} · ${d.name}` }));

  return (
    <>
      <PageTitle>{t("title")}</PageTitle>
      <form className="mb-5 flex flex-wrap items-end gap-3 rounded-xl border border-line bg-paper p-4">
        <label className="text-sm">
          <span className="label">{t("from")}</span>
          <input className="field" type="date" name="from" defaultValue={from} />
        </label>
        <label className="text-sm">
          <span className="label">{t("to")}</span>
          <input className="field" type="date" name="to" defaultValue={to} />
        </label>
        <label className="text-sm">
          <span className="label">{t("department")}</span>
          <select className="field" name="departmentId" defaultValue={sp.departmentId ?? ""}>
            <option value="" />
            {org.departments.map((d) => (
              <option key={d.id} value={d.id}>
                {companyName.get(d.companyId)} · {d.name}
              </option>
            ))}
          </select>
        </label>
        <button className={buttonClass("secondary")}>{t("show")}</button>
      </form>

      <ShiftsBoard shifts={shifts} canManage={!!manage} />

      {manage && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card title={t("add")}>
            <ShiftForm
              people={people.filter((p) => p.access !== "basic" || manage === "all").map((p) => ({ id: p.id, label: `${p.lastName} ${p.firstName} · ${p.department.name}` }))}
              companies={org.companies.map((c) => ({ id: c.id, label: c.name }))}
              departments={departments}
            />
          </Card>
          <Card title={t("import")}>
            <ShiftImport />
          </Card>
        </div>
      )}
    </>
  );
}
