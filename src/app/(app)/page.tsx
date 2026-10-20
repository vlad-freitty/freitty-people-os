import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { LocalTime } from "@/components/local-time";
import { Badge, Card, LinkButton, PageTitle } from "@/components/ui";
import { formatDate, formatMoney, localized } from "@/lib/format";
import { getActor } from "@/server/auth/session";
import { scopeOf } from "@/server/authz/policy";
import { isoWeekday, nextIso } from "@/server/calendar/core";
import { getBalance } from "@/server/services/absences";
import { licenseCosts } from "@/server/services/assets";
import { calendarView, canSeeTeamAbsences, visibleAbsences } from "@/server/services/calendar";
import { expiringDocuments, getDashboard, headcountByDepartment, paymentsByStatus, probationMilestones, requestsByStatus } from "@/server/services/dashboard";
import { getMe } from "@/server/services/me";
import { listBonuses, listPayments } from "@/server/services/payments";
import { listMyTasks, listNeedsAssignment, listOverdueSteps, listRequests } from "@/server/services/requests";
import { listShifts } from "@/server/services/shifts";

const REQUEST_TONE = { draft: "neutral", in_progress: "warn", done: "ok", rejected: "red", cancelled: "neutral" } as const;
const PAYMENT_TONE = { calculated: "warn", documents_received: "warn", approved: "ok", paid: "ink" } as const;

/**
 * Dashboards (PRD 7). One page; every block appears only when the viewer's permissions allow it:
 * personal blocks for everyone, team blocks for department scopes, company & finance blocks for "all" scopes.
 */
export default async function DashboardPage() {
  const actor = await getActor();
  const me = await getMe(actor);
  const today = new Date().toISOString().slice(0, 10);
  const weekEnd = nextIso(today, 7 - isoWeekday(today));
  const hasProfile = !!me.employee;
  const allScope = (p: Parameters<typeof scopeOf>[1]) => scopeOf(actor, p) === "all";

  const [
    data,
    tasks,
    myRequests,
    balance,
    upcoming,
    myShifts,
    myPayments,
    absentWeek,
    teamRequests,
    overdue,
    probation,
    expiring,
    byDepartment,
    unassigned,
    paymentStatus,
    bonuses,
    costs,
  ] = await Promise.all([
    getDashboard(actor),
    listMyTasks(actor),
    hasProfile ? listRequests(actor, { mine: "initiated", status: "in_progress" }) : Promise.resolve([]),
    hasProfile ? getBalance(actor, me.employee!.id) : Promise.resolve(null),
    hasProfile ? calendarView(actor, { from: today, to: nextIso(today, 14) }) : Promise.resolve(null),
    hasProfile ? listShifts(actor, { from: today, to: nextIso(weekEnd, 7), employeeId: me.employee!.id }) : Promise.resolve([]),
    hasProfile ? listPayments(actor, { employeeId: me.employee!.id }) : Promise.resolve([]),
    canSeeTeamAbsences(actor) ? visibleAbsences(actor, today, weekEnd) : Promise.resolve([]),
    requestsByStatus(actor),
    listOverdueSteps(actor),
    probationMilestones(actor),
    expiringDocuments(actor),
    headcountByDepartment(actor),
    listNeedsAssignment(actor),
    paymentsByStatus(actor),
    allScope("payments.manage") ? listBonuses(actor) : Promise.resolve(null),
    allScope("assets.manage") ? licenseCosts(actor) : Promise.resolve(null),
  ]);
  const t = await getTranslations();
  const locale = await getLocale();
  const nothing = <p className="text-sm text-ink-mute">{t("dashboard2.nothing")}</p>;
  const isoOf = (d: Date) => d.toISOString().slice(0, 10);
  const absentToday = absentWeek.filter((a) => isoOf(a.startDate) <= today && isoOf(a.endDate) >= today);
  const upcomingItems = (upcoming?.items ?? []).filter((i) => i.kind !== "absence").slice(0, 8);
  const showTeam = canSeeTeamAbsences(actor) || teamRequests || overdue.length > 0 || probation.length > 0 || expiring || byDepartment;
  const showCompany = allScope("employees.view") || paymentStatus || bonuses || costs || scopeOf(actor, "steps.reassign") === "all";

  return (
    <>
      <PageTitle actions={me.employee && <LinkButton variant="secondary" href={`/employees/${me.employee.id}`}>{t("dashboard.myProfile")}</LinkButton>}>
        {t("dashboard.greeting", { name: me.employee?.name ?? me.email })}
      </PageTitle>
      <p className="-mt-4 mb-6 text-sm text-ink-soft">{t("dashboard.role", { role: localized(locale, me.role.nameUk, me.role.nameEn) })}</p>

      {/* ───────────── personal ───────────── */}
      <Section title={t("dashboard4.personal")}>
        <Card title={t("dashboard2.myTasks")} actions={tasks.length > 0 && <Link className="text-sm underline" href="/tasks">{t("dashboard2.allTasks")}</Link>}>
          {tasks.length === 0 ? nothing : (
            <ul className="space-y-2 text-sm">
              {tasks.slice(0, 6).map((task) => (
                <li key={task.stepId} className="flex justify-between gap-3">
                  <Link className="min-w-0 hover:text-red" href={`/requests/${task.requestId}`}>
                    <span className="block truncate font-medium">{localized(locale, task.nameUk, task.nameEn)}</span>
                    <span className="block truncate text-xs text-ink-mute">
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

        {balance && (
          <Card title={t("dashboard3.balance")} actions={<Link className="text-sm underline" href="/requests/new">{t("balance.request")}</Link>}>
            <p className="font-display text-4xl font-semibold">{t("balance.days", { n: balance.balance })}</p>
            <p className="text-xs text-ink-mute">{balance.policy?.name ?? t("balance.noPolicy")}</p>
          </Card>
        )}

        {hasProfile && (
          <Card title={t("dashboard4.myRequests")} actions={<Link className="text-sm underline" href="/requests?mine=initiated">{t("dashboard4.all")}</Link>}>
            {myRequests.length === 0 ? nothing : (
              <ul className="space-y-1.5 text-sm">
                {myRequests.slice(0, 5).map((r) => (
                  <li key={r.id} className="flex justify-between gap-2">
                    <Link className="min-w-0 truncate hover:text-red" href={`/requests/${r.id}`}>
                      <span className="font-mono text-xs text-ink-mute">{r.number}</span> {localized(locale, r.type.nameUk, r.type.nameEn)}
                    </Link>
                    {r.overdue && <Badge tone="red">{t("requests.overdue")}</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {upcoming && (
          <Card title={t("dashboard3.upcoming")} actions={<Link className="text-sm underline" href="/calendar">{t("nav.calendar")}</Link>}>
            {upcomingItems.length === 0 ? nothing : (
              <ul className="space-y-1 text-sm">
                {upcomingItems.map((i, n) => (
                  <li key={n} className="flex justify-between gap-2">
                    <span className="truncate">
                      {i.kind === "birthday" ? "🎂 " : i.kind === "anniversary" ? "🎉 " : ""}
                      {i.kind === "event" ? localized(locale, i.title, i.titleEn) : i.title}
                    </span>
                    <span className={`whitespace-nowrap text-xs ${i.nonWorking ? "text-red-strong" : "text-ink-soft"}`}>{formatDate(i.date, locale)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {myShifts.length > 0 && (
          <Card title={t("dashboard4.myShifts")}>
            <ul className="space-y-1 text-sm">
              {myShifts.slice(0, 8).map((s) => (
                <li key={s.id} className="flex justify-between gap-2">
                  <span>{formatDate(s.workDate, locale)}</span>
                  <span className="font-mono text-xs text-ink-soft">
                    {s.start.slice(11)}–{s.end.slice(11)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {myPayments.length > 0 && (
          <Card title={t("dashboard4.myPayments")}>
            <ul className="space-y-1 text-sm">
              {myPayments.slice(0, 4).map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2">
                  <span>{p.period.label}</span>
                  <span className="flex items-center gap-2">
                    <span className="font-mono">{formatMoney(p.total, p.currency, locale)}</span>
                    <Badge tone={PAYMENT_TONE[p.status]}>{t(`payments.status.${p.status}`)}</Badge>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </Section>

      {/* ───────────── team ───────────── */}
      {showTeam && (
        <Section title={t("dashboard4.team")}>
          {canSeeTeamAbsences(actor) && (
            <Card title={t("dashboard3.absentToday")}>
              {absentToday.length === 0 ? nothing : (
                <ul className="space-y-1 text-sm">
                  {absentToday.map((a) => (
                    <li key={a.id}>
                      <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: a.type.color }} />
                      {a.employee.firstName} {a.employee.lastName} · {localized(locale, a.type.nameUk, a.type.nameEn)}
                    </li>
                  ))}
                </ul>
              )}
              {absentWeek.length > absentToday.length && (
                <>
                  <p className="label mt-3">{t("dashboard3.absentWeek")}</p>
                  <ul className="space-y-1 text-sm">
                    {absentWeek
                      .filter((a) => !absentToday.includes(a))
                      .map((a) => (
                        <li key={a.id}>
                          {a.employee.firstName} {a.employee.lastName} · {formatDate(isoOf(a.startDate), locale)} — {formatDate(isoOf(a.endDate), locale)}
                        </li>
                      ))}
                  </ul>
                </>
              )}
            </Card>
          )}

          {teamRequests && (
            <Card title={t("dashboard4.teamRequests")} actions={<Link className="text-sm underline" href="/requests">{t("dashboard4.all")}</Link>}>
              <ul className="flex flex-wrap gap-2">
                {(["in_progress", "done", "rejected", "cancelled"] as const).map((s) => (
                  <li key={s}>
                    <Badge tone={REQUEST_TONE[s]}>
                      {t(`requests.status.${s}`)}: {teamRequests[s] ?? 0}
                    </Badge>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {(scopeOf(actor, "requests.view") === "all" || scopeOf(actor, "requests.view") === "departments") && (
            <Card title={t("dashboard2.overdue")}>
              {overdue.length === 0 ? nothing : (
                <ul className="space-y-2 text-sm">
                  {overdue.map((s) => (
                    <li key={s.stepId} className="flex justify-between gap-3">
                      <Link className="min-w-0 hover:text-red" href={`/requests/${s.requestId}`}>
                        <span className="block truncate">{localized(locale, s.nameUk, s.nameEn)}</span>
                        <span className="block truncate text-xs text-ink-mute">
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

          {scopeOf(actor, "employees.view") && scopeOf(actor, "employees.view") !== "self" && (
            <Card title={t("dashboard2.probation")}>
              {probation.length === 0 ? nothing : (
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

          {expiring && (
            <Card title={t("dashboard4.expiringDocs")}>
              {expiring.length === 0 ? nothing : (
                <ul className="space-y-1.5 text-sm">
                  {expiring.map((d) => (
                    <li key={d.id} className="flex justify-between gap-2">
                      <Link className="min-w-0 truncate hover:text-red" href={`/employees/${d.employee.id}`}>
                        {d.employee.name} · {t(`profile.docType.${d.type}`)}
                      </Link>
                      <span className="whitespace-nowrap text-xs text-warn">{formatDate(d.validTo, locale)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          {byDepartment && (
            <Card title={t("dashboard4.headcountDepartments")}>
              <ul className="space-y-1 text-sm">
                {byDepartment.map((d) => (
                  <li key={d.id} className="flex justify-between gap-2 border-b border-line/50 pb-1">
                    <span className="truncate">
                      {d.name} <span className="text-xs text-ink-mute">· {d.company}</span>
                    </span>
                    <span className="font-display text-lg">{d.count}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </Section>
      )}

      {/* ───────────── companies & finance ───────────── */}
      {showCompany && (
        <Section title={t("dashboard4.company")}>
          {scopeOf(actor, "steps.reassign") && (
            <Card title={t("dashboard2.needsAssignment")}>
              {unassigned.length === 0 ? nothing : (
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

          {allScope("employees.view") && (
            <Card title={t("dashboard4.headcountCompanies")}>
              <ul className="space-y-2">
                {data.byCompany.map((c) => (
                  <li key={c.id} className="flex items-baseline justify-between border-b border-line pb-1">
                    <span className="font-medium">{c.name}</span>
                    <span className="font-display text-2xl">{c.count}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {paymentStatus && (
            <Card title={t("dashboard4.paymentsStatus")} actions={<Link className="text-sm underline" href="/payments">{t("nav.payments")}</Link>}>
              {paymentStatus.length === 0 ? nothing : (
                <ul className="space-y-1 text-sm">
                  {paymentStatus.map((p) => (
                    <li key={`${p.status}-${p.currency}`} className="flex items-center justify-between gap-2">
                      <Badge tone={PAYMENT_TONE[p.status]}>
                        {t(`payments.status.${p.status}`)}: {p.count}
                      </Badge>
                      <span className="font-mono">{formatMoney(p.total, p.currency, locale)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          {bonuses && (
            <Card title={t("dashboard4.bonuses")}>
              {bonuses.length === 0 ? nothing : (
                <ul className="space-y-1 text-sm">
                  {bonuses.slice(0, 8).map((b) => (
                    <li key={b.id} className="flex justify-between gap-2">
                      <span className="truncate">
                        {b.employee} · {b.period}
                      </span>
                      <span className="whitespace-nowrap font-mono">{formatMoney(b.amount, b.currency, locale)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          {costs && (
            <Card title={t("dashboard2.licenses")} actions={<Link className="text-sm underline" href="/assets">{t("nav.assets")}</Link>}>
              {costs.length === 0 ? nothing : costs.map((c) => (
                <p key={c.currency ?? "-"} className="font-display text-3xl font-semibold">
                  {c.currency ? formatMoney(c.total, c.currency, locale) : c.total}
                </p>
              ))}
            </Card>
          )}
        </Section>
      )}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-xs font-semibold tracking-widest text-ink-mute uppercase">{title}</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{children}</div>
    </section>
  );
}
