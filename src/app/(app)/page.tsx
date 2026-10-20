import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { LocalTime } from "@/components/local-time";
import { Badge, Card, LinkButton, PageTitle } from "@/components/ui";
import { formatDate, formatMoney, localized } from "@/lib/format";
import { getActor } from "@/server/auth/session";
import { scopeOf } from "@/server/authz/policy";
import { licenseCosts } from "@/server/services/assets";
import { getDashboard, probationMilestones } from "@/server/services/dashboard";
import { getMe } from "@/server/services/me";
import { listMyTasks, listNeedsAssignment, listOverdueSteps } from "@/server/services/requests";

export default async function DashboardPage() {
  const actor = await getActor();
  const [me, data, tasks, overdue, unassigned, probation, costs] = await Promise.all([
    getMe(actor),
    getDashboard(actor),
    listMyTasks(actor),
    listOverdueSteps(actor),
    listNeedsAssignment(actor),
    probationMilestones(actor),
    scopeOf(actor, "assets.manage") === "all" ? licenseCosts(actor) : Promise.resolve([]),
  ]);
  const t = await getTranslations();
  const locale = await getLocale();
  const nothing = <p className="text-sm text-ink-mute">{t("dashboard2.nothing")}</p>;

  return (
    <>
      <PageTitle actions={me.employee && <LinkButton variant="secondary" href={`/employees/${me.employee.id}`}>{t("dashboard.myProfile")}</LinkButton>}>
        {t("dashboard.greeting", { name: me.employee?.name ?? me.email })}
      </PageTitle>
      <p className="-mt-4 mb-6 text-sm text-ink-soft">{t("dashboard.role", { role: localized(locale, me.role.nameUk, me.role.nameEn) })}</p>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={t("dashboard2.myTasks")} actions={tasks.length > 0 && <Link className="text-sm underline" href="/tasks">{t("dashboard2.allTasks")}</Link>}>
          {tasks.length === 0
            ? nothing
            : (
              <ul className="space-y-2 text-sm">
                {tasks.slice(0, 6).map((task) => (
                  <li key={task.stepId} className="flex justify-between gap-3">
                    <Link className="hover:text-red" href={`/requests/${task.requestId}`}>
                      <span className="font-medium">{localized(locale, task.nameUk, task.nameEn)}</span>
                      <span className="block text-xs text-ink-mute">
                        {task.number} · {localized(locale, task.requestType.nameUk, task.requestType.nameEn)}
                      </span>
                    </Link>
                    {task.dueAt && (
                      <span className={`whitespace-nowrap text-xs ${task.overdue ? "font-medium text-red-strong" : "text-ink-soft"}`}>
                        <LocalTime iso={task.dueAt} />
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
        </Card>

        {(scopeOf(actor, "requests.view") === "all" || scopeOf(actor, "requests.view") === "departments") && (
          <Card title={t("dashboard2.overdue")}>
            {overdue.length === 0
              ? nothing
              : (
                <ul className="space-y-2 text-sm">
                  {overdue.map((s) => (
                    <li key={s.stepId} className="flex justify-between gap-3">
                      <Link className="hover:text-red" href={`/requests/${s.requestId}`}>
                        {localized(locale, s.nameUk, s.nameEn)}
                        <span className="block text-xs text-ink-mute">
                          {s.number} · {s.assignee}
                        </span>
                      </Link>
                      <span className="whitespace-nowrap text-xs font-medium text-red-strong">
                        <LocalTime iso={s.dueAt} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
          </Card>
        )}

        {scopeOf(actor, "steps.reassign") && (
          <Card title={t("dashboard2.needsAssignment")}>
            {unassigned.length === 0
              ? nothing
              : (
                <ul className="space-y-2 text-sm">
                  {unassigned.map((s) => (
                    <li key={s.stepId}>
                      <Link className="hover:text-red" href={`/requests/${s.requestId}`}>
                        <Badge tone="red">{s.number}</Badge> {localized(locale, s.nameUk, s.nameEn)}
                        {s.system && <span className="text-ink-soft"> · {s.system}</span>}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
          </Card>
        )}

        {scopeOf(actor, "employees.view") && scopeOf(actor, "employees.view") !== "self" && (
          <Card title={t("dashboard2.probation")}>
            {probation.length === 0
              ? nothing
              : (
                <ul className="space-y-2 text-sm">
                  {probation.map((p) => (
                    <li key={`${p.employeeId}-${p.day}`} className="flex justify-between gap-3">
                      <Link className="hover:text-red" href={`/employees/${p.employeeId}`}>
                        {p.name}
                        <span className="block text-xs text-ink-mute">{p.department}</span>
                      </Link>
                      <span className="text-right text-xs">
                        <Badge tone={p.day === 90 ? "red" : "warn"}>{t("dashboard2.probationDay", { days: p.day })}</Badge>
                        <span className="block text-ink-soft">{formatDate(p.date, locale)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
          </Card>
        )}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Stat label={t("dashboard.headcount")} value={String(data.headcount)} />
        <Stat label={t("dashboard.departments")} value={String(data.departments)} />
        {costs.map((c) => (
          <Stat key={c.currency ?? "-"} label={t("dashboard2.licenses")} value={c.currency ? formatMoney(c.total, c.currency, locale) : c.total} />
        ))}
      </div>
      {data.headcount > 0 && (
        <Card className="mt-6" title={t("dashboard.headcount")}>
          <ul className="grid gap-3 sm:grid-cols-3">
            {data.byCompany.map((c) => (
              <li key={c.id} className="flex items-baseline justify-between border-b border-line pb-2">
                <span className="font-medium">{c.name}</span>
                <span className="font-display text-2xl">{c.count}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-paper p-5">
      <p className="label">{label}</p>
      <p className="font-display text-3xl font-semibold">{value}</p>
    </div>
  );
}
