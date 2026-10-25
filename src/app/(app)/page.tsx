import {
  Alert02Icon,
  Award01Icon,
  BirthdayCakeIcon,
  Building03Icon,
  Calendar03Icon,
  Clock01Icon,
  DocumentValidationIcon,
  FileEditIcon,
  GiftIcon,
  HierarchySquare01Icon,
  HourglassIcon,
  LaptopIcon,
  TaskDone01Icon,
  UserCircleIcon,
  UserGroupIcon,
  UserQuestion01Icon,
  UserRemove01Icon,
  Wallet01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { getLocale, getTranslations } from "next-intl/server";
import { BalanceList } from "@/components/balance-list";
import { LocalTime } from "@/components/local-time";
import { Avatar, Badge, Card, DateLeaf, Empty, IconTile, Kpi, LinkButton, List, ListRow, PageTitle, SectionTitle } from "@/components/ui";
import { formatDate, formatMoney, localized } from "@/lib/format";
import { getActor } from "@/server/auth/session";
import { scopeOf } from "@/server/authz/policy";
import { isoWeekday, nextIso } from "@/server/calendar/core";
import { getBalances } from "@/server/services/absences";
import { licenseCosts } from "@/server/services/assets";
import { calendarView, canSeeTeamAbsences, visibleAbsences } from "@/server/services/calendar";
import { expiringDocuments, getDashboard, headcountByDepartment, paymentsByStatus, probationMilestones, requestsByStatus } from "@/server/services/dashboard";
import { getMe } from "@/server/services/me";
import { listBonuses, listPayments } from "@/server/services/payments";
import { listMyTasks, listNeedsAssignment, listOverdueSteps, listRequests } from "@/server/services/requests";
import { listShifts } from "@/server/services/shifts";

const PAYMENT_TONE = { calculated: "warn", documents_received: "warn", approved: "ok", paid: "ink" } as const;
const REQUEST_TILES = [
  { status: "in_progress", className: "bg-warn-tint text-warn" },
  { status: "done", className: "bg-ok-tint text-ok-strong" },
  { status: "rejected", className: "bg-red-tint text-red" },
  { status: "cancelled", className: "bg-cream text-ink-soft" },
] as const;

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
    hasProfile ? getBalances(actor, me.employee!.id) : Promise.resolve(null),
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
  const isoOf = (d: Date) => d.toISOString().slice(0, 10);
  const vacation = balance?.balances.find((b) => b.type.code === "vacation") ?? balance?.balances[0] ?? null;
  // Remote Days are working days — not "who is absent" (phase 6)
  const awayWeek = absentWeek.filter((a) => !a.type.countsAsWorking);
  const absentToday = awayWeek.filter((a) => isoOf(a.startDate) <= today && isoOf(a.endDate) >= today);
  const upcomingItems = (upcoming?.items ?? []).filter((i) => i.kind !== "absence").slice(0, 6);
  const showTeam = canSeeTeamAbsences(actor) || teamRequests || overdue.length > 0 || probation.length > 0 || expiring || byDepartment;
  const showCompany = allScope("employees.view") || paymentStatus || bonuses || costs || scopeOf(actor, "steps.reassign") === "all";
  const headcount = data.byCompany.reduce((s, c) => s + c.count, 0);
  const maxDept = Math.max(1, ...(byDepartment ?? []).map((d) => d.count));
  const maxCompany = Math.max(1, ...data.byCompany.map((c) => c.count));

  return (
    <>
      <PageTitle
        subtitle={t("dashboard.role", { role: localized(locale, me.role.nameUk, me.role.nameEn) })}
        actions={
          me.employee && (
            <LinkButton variant="secondary" href={`/employees/${me.employee.id}`}>
              <HugeiconsIcon icon={UserCircleIcon} size={18} />
              {t("dashboard.myProfile")}
            </LinkButton>
          )
        }
      >
        {t("dashboard.greeting", { name: me.name })}
      </PageTitle>

      <div className="mb-8 grid grid-cols-[repeat(auto-fit,minmax(155px,1fr))] gap-3 sm:gap-4">
        <Kpi label={t("dashboard2.myTasks")} value={tasks.length} icon={TaskDone01Icon} tone="ok" href="/tasks" />
        {hasProfile && <Kpi label={t("dashboard4.myRequests")} value={myRequests.length} icon={FileEditIcon} tone="blue" href="/requests?mine=initiated" />}
        {vacation && <Kpi label={localized(locale, vacation.type.nameUk, vacation.type.nameEn)} value={vacation.balance} hint={t("dashboard3.balance")} icon={Calendar03Icon} tone="warn" />}
        {showTeam && <Kpi label={t("dashboard2.overdue")} value={overdue.length} icon={Alert02Icon} tone="red" />}
        {allScope("employees.view") && <Kpi label={t("dashboard5.people")} value={headcount} icon={UserGroupIcon} tone="blue" href="/employees" />}
      </div>

      {/* ───────────── personal ───────────── */}
      <Section icon={UserCircleIcon} title={t("dashboard4.personal")}>
        <Card icon={TaskDone01Icon} tone="ok" title={t("dashboard2.myTasks")} link={tasks.length > 0 ? { href: "/tasks", label: t("dashboard2.allTasks") } : undefined}>
          {tasks.length === 0 ? (
            <Empty>{t("dashboard5.emptyTasks")}</Empty>
          ) : (
            <List>
              {tasks.slice(0, 6).map((task) => (
                <ListRow
                  key={task.stepId}
                  href={`/requests/${task.requestId}`}
                  leading={<IconTile icon={task.overdue ? Alert02Icon : FileEditIcon} tone={task.overdue ? "red" : "neutral"} size={32} />}
                  title={localized(locale, task.nameUk, task.nameEn)}
                  subtitle={`${task.number} · ${localized(locale, task.requestType.nameUk, task.requestType.nameEn)}`}
                  trailing={
                    task.dueAt && (
                      <span className={`text-xs whitespace-nowrap ${task.overdue ? "font-medium text-red-strong" : "text-ink-soft"}`}>
                        <LocalTime iso={task.dueAt} />
                      </span>
                    )
                  }
                />
              ))}
            </List>
          )}
        </Card>

        {balance && (
          <Card icon={Calendar03Icon} tone="warn" title={t("dashboard3.balance")} link={{ href: "/requests/new", label: t("balance.request") }}>
            <BalanceList eligible={balance.eligible} balances={balance.balances} locale={locale} />
          </Card>
        )}

        {hasProfile && (
          <Card icon={FileEditIcon} tone="blue" title={t("dashboard4.myRequests")} link={{ href: "/requests?mine=initiated", label: t("dashboard4.all") }}>
            {myRequests.length === 0 ? (
              <Empty>{t("dashboard5.emptyRequests")}</Empty>
            ) : (
              <List>
                {myRequests.slice(0, 5).map((r) => (
                  <ListRow
                    key={r.id}
                    href={`/requests/${r.id}`}
                    leading={<IconTile icon={FileEditIcon} tone="blue" size={32} />}
                    title={localized(locale, r.type.nameUk, r.type.nameEn)}
                    subtitle={r.number}
                    trailing={r.overdue ? <Badge tone="red">{t("requests.overdue")}</Badge> : <Badge tone="warn">{t("requests.status.in_progress")}</Badge>}
                  />
                ))}
              </List>
            )}
          </Card>
        )}

        {upcoming && (
          <Card icon={Calendar03Icon} tone="blue" title={t("dashboard3.upcoming")} link={{ href: "/calendar", label: t("nav.calendar") }}>
            {upcomingItems.length === 0 ? (
              <Empty icon={Calendar03Icon}>{t("dashboard5.emptyUpcoming")}</Empty>
            ) : (
              <List>
                {upcomingItems.map((i, n) => (
                  <ListRow
                    key={n}
                    leading={<DateLeaf iso={i.date} locale={locale} tone={i.nonWorking ? "red" : "neutral"} />}
                    title={
                      <span className="flex items-center gap-1.5">
                        {i.kind === "birthday" && <HugeiconsIcon icon={BirthdayCakeIcon} size={15} className="shrink-0 text-red" />}
                        {i.kind === "anniversary" && <HugeiconsIcon icon={Award01Icon} size={15} className="shrink-0 text-warn" />}
                        <span className="truncate">{i.kind === "event" ? localized(locale, i.title, i.titleEn) : i.title}</span>
                      </span>
                    }
                    subtitle={i.nonWorking ? t("dashboard5.dayOff") : formatDate(i.date, locale)}
                  />
                ))}
              </List>
            )}
          </Card>
        )}

        {myShifts.length > 0 && (
          <Card icon={Clock01Icon} tone="neutral" title={t("dashboard4.myShifts")} link={{ href: "/shifts", label: t("nav.shifts") }}>
            <List>
              {myShifts.slice(0, 6).map((s) => (
                <ListRow
                  key={s.id}
                  leading={<DateLeaf iso={s.workDate} locale={locale} />}
                  title={`${s.start.slice(11)}–${s.end.slice(11)}`}
                  subtitle={formatDate(s.workDate, locale)}
                />
              ))}
            </List>
          </Card>
        )}

        {myPayments.length > 0 && (
          <Card icon={Wallet01Icon} tone="ok" title={t("dashboard4.myPayments")}>
            <List>
              {myPayments.slice(0, 4).map((p) => (
                <ListRow
                  key={p.id}
                  title={<span className="font-mono">{formatMoney(p.total, p.currency, locale)}</span>}
                  subtitle={p.period.label}
                  trailing={<Badge tone={PAYMENT_TONE[p.status]}>{t(`payments.status.${p.status}`)}</Badge>}
                />
              ))}
            </List>
          </Card>
        )}
      </Section>

      {/* ───────────── team ───────────── */}
      {showTeam && (
        <Section icon={UserGroupIcon} title={t("dashboard4.team")}>
          {canSeeTeamAbsences(actor) && (
            <Card icon={UserRemove01Icon} tone="warn" title={t("dashboard3.absentToday")} link={{ href: "/calendar", label: t("nav.calendar") }}>
              {absentToday.length === 0 ? (
                <Empty icon={UserGroupIcon}>{t("dashboard5.emptyAbsent")}</Empty>
              ) : (
                <List>
                  {absentToday.map((a) => (
                    <ListRow
                      key={a.id}
                      leading={<Avatar name={`${a.employee.firstName} ${a.employee.lastName}`} />}
                      title={`${a.employee.firstName} ${a.employee.lastName}`}
                      subtitle={
                        <span className="flex items-center gap-1.5">
                          <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: a.type.color }} />
                          {localized(locale, a.type.nameUk, a.type.nameEn)} · {t("dashboard5.until", { date: formatDate(isoOf(a.endDate), locale) ?? "" })}
                        </span>
                      }
                    />
                  ))}
                </List>
              )}
              {awayWeek.length > absentToday.length && (
                <>
                  <p className="label mt-5 mb-2">{t("dashboard3.absentWeek")}</p>
                  <List>
                    {awayWeek
                      .filter((a) => !absentToday.includes(a))
                      .map((a) => (
                        <ListRow
                          key={a.id}
                          leading={<DateLeaf iso={isoOf(a.startDate)} locale={locale} />}
                          title={`${a.employee.firstName} ${a.employee.lastName}`}
                          subtitle={`${formatDate(isoOf(a.startDate), locale)} — ${formatDate(isoOf(a.endDate), locale)}`}
                        />
                      ))}
                  </List>
                </>
              )}
            </Card>
          )}

          {teamRequests && (
            <Card icon={FileEditIcon} tone="blue" title={t("dashboard4.teamRequests")} link={{ href: "/requests", label: t("dashboard4.all") }}>
              <ul className="grid grid-cols-2 gap-2">
                {REQUEST_TILES.map(({ status, className }) => (
                  <li key={status} className={`rounded-2xl px-4 py-3 ${className}`}>
                    <p className="text-2xl leading-none font-bold">{teamRequests[status] ?? 0}</p>
                    <p className="mt-1 text-xs font-medium">{t(`requests.status.${status}`)}</p>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {(scopeOf(actor, "requests.view") === "all" || scopeOf(actor, "requests.view") === "departments") && (
            <Card icon={Alert02Icon} title={t("dashboard2.overdue")}>
              {overdue.length === 0 ? (
                <Empty>{t("dashboard5.emptyOverdue")}</Empty>
              ) : (
                <List>
                  {overdue.map((s) => (
                    <ListRow
                      key={s.stepId}
                      href={`/requests/${s.requestId}`}
                      leading={<IconTile icon={Alert02Icon} size={32} />}
                      title={localized(locale, s.nameUk, s.nameEn)}
                      subtitle={`${s.number} · ${s.assignee}`}
                      trailing={
                        <span className="text-xs font-medium whitespace-nowrap text-red-strong">
                          <LocalTime iso={s.dueAt} />
                        </span>
                      }
                    />
                  ))}
                </List>
              )}
            </Card>
          )}

          {scopeOf(actor, "employees.view") && scopeOf(actor, "employees.view") !== "self" && (
            <Card icon={HourglassIcon} tone="warn" title={t("dashboard2.probation")}>
              {probation.length === 0 ? (
                <Empty icon={HourglassIcon}>{t("dashboard5.emptyProbation")}</Empty>
              ) : (
                <List>
                  {probation.map((p) => (
                    <ListRow
                      key={`${p.employeeId}-${p.day}`}
                      href={`/employees/${p.employeeId}`}
                      leading={<Avatar name={p.name} />}
                      title={p.name}
                      subtitle={`${p.department} · ${formatDate(p.date, locale)}`}
                      trailing={<Badge tone={p.day === 90 ? "red" : "warn"}>{t("dashboard2.probationDay", { days: p.day })}</Badge>}
                    />
                  ))}
                </List>
              )}
            </Card>
          )}

          {expiring && (
            <Card icon={DocumentValidationIcon} tone="warn" title={t("dashboard4.expiringDocs")}>
              {expiring.length === 0 ? (
                <Empty icon={DocumentValidationIcon}>{t("dashboard5.emptyDocs")}</Empty>
              ) : (
                <List>
                  {expiring.map((d) => (
                    <ListRow
                      key={d.id}
                      href={`/employees/${d.employee.id}`}
                      leading={<DateLeaf iso={d.validTo} locale={locale} tone="red" />}
                      title={d.employee.name}
                      subtitle={t(`profile.docType.${d.type}`)}
                    />
                  ))}
                </List>
              )}
            </Card>
          )}

          {byDepartment && (
            <Card icon={HierarchySquare01Icon} tone="blue" title={t("dashboard4.headcountDepartments")} link={{ href: "/org", label: t("nav.org") }}>
              <Bars items={byDepartment.map((d) => ({ id: d.id, label: d.name, hint: d.company, value: d.count }))} max={maxDept} />
            </Card>
          )}
        </Section>
      )}

      {/* ───────────── companies & finance ───────────── */}
      {showCompany && (
        <Section icon={Building03Icon} title={t("dashboard4.company")}>
          {scopeOf(actor, "steps.reassign") && (
            <Card icon={UserQuestion01Icon} tone="red" title={t("dashboard2.needsAssignment")}>
              {unassigned.length === 0 ? (
                <Empty>{t("dashboard5.emptyUnassigned")}</Empty>
              ) : (
                <List>
                  {unassigned.map((s) => (
                    <ListRow
                      key={s.stepId}
                      href={`/requests/${s.requestId}`}
                      leading={<IconTile icon={UserQuestion01Icon} size={32} />}
                      title={localized(locale, s.nameUk, s.nameEn)}
                      subtitle={[s.number, s.system].filter(Boolean).join(" · ")}
                    />
                  ))}
                </List>
              )}
            </Card>
          )}

          {allScope("employees.view") && (
            <Card icon={Building03Icon} tone="blue" title={t("dashboard4.headcountCompanies")} subtitle={t("dashboard5.total", { n: headcount })}>
              <Bars items={data.byCompany.map((c) => ({ id: c.id, label: c.name, value: c.count }))} max={maxCompany} />
            </Card>
          )}

          {paymentStatus && (
            <Card icon={Wallet01Icon} tone="ok" title={t("dashboard4.paymentsStatus")} link={{ href: "/payments", label: t("nav.payments") }}>
              {paymentStatus.length === 0 ? (
                <Empty icon={Wallet01Icon}>{t("dashboard5.emptyPayments")}</Empty>
              ) : (
                <List>
                  {paymentStatus.map((p) => (
                    <ListRow
                      key={`${p.status}-${p.currency}`}
                      title={<span className="font-mono">{formatMoney(p.total, p.currency, locale)}</span>}
                      subtitle={t("dashboard5.paymentsCount", { n: p.count })}
                      trailing={<Badge tone={PAYMENT_TONE[p.status]}>{t(`payments.status.${p.status}`)}</Badge>}
                    />
                  ))}
                </List>
              )}
            </Card>
          )}

          {bonuses && (
            <Card icon={GiftIcon} tone="warn" title={t("dashboard4.bonuses")}>
              {bonuses.length === 0 ? (
                <Empty icon={GiftIcon}>{t("dashboard5.emptyBonuses")}</Empty>
              ) : (
                <List>
                  {bonuses.slice(0, 6).map((b) => (
                    <ListRow
                      key={b.id}
                      leading={<Avatar name={b.employee} />}
                      title={b.employee}
                      subtitle={b.period}
                      trailing={<span className="font-mono text-sm whitespace-nowrap text-ink-2">{formatMoney(b.amount, b.currency, locale)}</span>}
                    />
                  ))}
                </List>
              )}
            </Card>
          )}

          {costs && (
            <Card icon={LaptopIcon} tone="neutral" title={t("dashboard2.licenses")} link={{ href: "/assets", label: t("nav.assets") }}>
              {costs.length === 0 ? (
                <Empty icon={LaptopIcon}>{t("dashboard5.emptyLicenses")}</Empty>
              ) : (
                costs.map((c) => (
                  <p key={c.currency ?? "-"} className="text-[28px] leading-tight font-bold text-ink-2">
                    {c.currency ? formatMoney(c.total, c.currency, locale) : c.total}
                  </p>
                ))
              )}
            </Card>
          )}
        </Section>
      )}
    </>
  );
}

function Section({ icon, title, children }: { icon: React.ComponentProps<typeof SectionTitle>["icon"]; title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <SectionTitle icon={icon}>{title}</SectionTitle>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{children}</div>
    </section>
  );
}

/** Horizontal bars for headcounts: label, number, bar proportional to the largest group. */
function Bars({ items, max }: { items: { id: string; label: string; hint?: string; value: number }[]; max: number }) {
  return (
    <ul className="space-y-3">
      {items.map((i) => (
        <li key={i.id}>
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="min-w-0 truncate font-medium text-ink-2">
              {i.label}
              {i.hint && <span className="ml-1 text-xs font-normal text-ink-mute">· {i.hint}</span>}
            </span>
            <span className="font-bold text-ink-2">{i.value}</span>
          </div>
          <div className="mt-1.5 h-2 rounded-full bg-cream">
            <div className="h-2 rounded-full bg-blue" style={{ width: `${Math.max(4, (i.value / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
