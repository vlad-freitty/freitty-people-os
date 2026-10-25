import { Add01Icon, Calendar03Icon, FileImportIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { sectionIcons } from "@/components/icons";
import { ShiftForm, ShiftImport, ShiftsBoard } from "@/components/money/shifts-board";
import { ModalButton } from "@/components/overlay";
import { buttonClass, PageTitle, Stat } from "@/components/ui";
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
  const [shifts, org, people, t, to2] = await Promise.all([
    listShifts(actor, { from, to, departmentId: sp.departmentId || undefined }),
    getOrgStructure(actor),
    manage ? listEmployees(actor) : Promise.resolve([]),
    getTranslations("shifts"),
    getTranslations("ops2"),
  ]);
  const companyName = new Map(org.companies.map((c) => [c.id, c.name]));
  const departments = org.departments
    .filter((d) => manage === "all" || can(actor, "shifts.manage", { departmentId: d.id }))
    .map((d) => ({ id: d.id, companyId: d.companyId, label: `${companyName.get(d.companyId)} · ${d.name}` }));
  const count = (status: string) => shifts.filter((s) => s.status === status).length;
  const hours = Math.round(shifts.reduce((s, x) => s + x.hours, 0) * 10) / 10;

  return (
    <>
      <PageTitle
        icon={sectionIcons.shifts}
        subtitle={to2("shiftsSubtitle")}
        actions={
          manage && (
            <>
              <ModalButton label={to2("importCsv")} icon={FileImportIcon} variant="secondary" title={t("import")} size="lg">
                <ShiftImport />
              </ModalButton>
              <ModalButton label={t("add")} icon={Add01Icon} title={t("add")} modalIcon={sectionIcons.shifts} size="lg">
                <ShiftForm
                  people={people.filter((p) => p.access !== "basic" || manage === "all").map((p) => ({ id: p.id, label: `${p.lastName} ${p.firstName} · ${p.department.name}` }))}
                  companies={org.companies.map((c) => ({ id: c.id, label: c.name }))}
                  departments={departments}
                />
              </ModalButton>
            </>
          )
        }
      >
        {t("title")}
      </PageTitle>

      <form className="mb-5 flex flex-wrap items-end gap-3 rounded-card border border-edge bg-paper p-4">
        <span className="mr-1 hidden items-center gap-2 self-center text-sm font-bold text-ink-2 sm:flex">
          <HugeiconsIcon icon={Calendar03Icon} size={18} className="text-ink-soft" />
          {to2("period")}
        </span>
        <label className="text-sm">
          <span className="label">{t("from")}</span>
          <input className="field" type="date" name="from" defaultValue={from} />
        </label>
        <label className="text-sm">
          <span className="label">{t("to")}</span>
          <input className="field" type="date" name="to" defaultValue={to} />
        </label>
        <label className="min-w-0 flex-1 text-sm sm:max-w-xs">
          <span className="label">{t("department")}</span>
          <select className="field" name="departmentId" defaultValue={sp.departmentId ?? ""}>
            <option value="">{to2("allDepartments")}</option>
            {org.departments.map((d) => (
              <option key={d.id} value={d.id}>
                {companyName.get(d.companyId)} · {d.name}
              </option>
            ))}
          </select>
        </label>
        <button className={buttonClass("secondary")}>{t("show")}</button>
      </form>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={to2("shiftsTotal")} value={shifts.length} />
        <Stat label={t("status.planned")} value={count("planned")} tone="warn" />
        <Stat label={t("status.confirmed")} value={count("confirmed")} tone="ok" />
        <Stat label={to2("hoursTotal")} value={hours} />
      </div>

      <ShiftsBoard shifts={shifts} canManage={!!manage} />
    </>
  );
}
