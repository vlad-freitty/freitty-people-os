import {
  Add01Icon,
  ArrowLeft01Icon,
  BirthdayCakeIcon,
  Briefcase01Icon,
  Building03Icon,
  Calendar03Icon,
  Call02Icon,
  Clock01Icon,
  File01Icon,
  HierarchySquare01Icon,
  HourglassIcon,
  LanguageSquareIcon,
  LaptopIcon,
  Location01Icon,
  Mail01Icon,
  Notification02Icon,
  PencilEdit02Icon,
  Shield01Icon,
  SlidersHorizontalIcon,
  Upload04Icon,
  UserCircleIcon,
  ViewIcon,
  Wallet01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { BalanceAdjustForm, CancelAbsenceButton } from "@/components/balance-actions";
import { BalanceList } from "@/components/balance-list";
import { DeleteEmployeeButton } from "@/components/delete-employee";
import { DocumentUpload } from "@/components/directories";
import { sectionIcons } from "@/components/icons";
import { PaymentsTable } from "@/components/money/payments-board";
import { NotificationSettings } from "@/components/notification-settings";
import { ModalButton } from "@/components/overlay";
import { RateForm } from "@/components/rate-form";
import { Badge, Card, DateLeaf, Empty, IconTile, LinkButton, List, ListRow, statusTone } from "@/components/ui";
import { formatDate, formatMoney, formatMonthDay, localized } from "@/lib/format";
import { getActor } from "@/server/auth/session";
import { can, scopeOf } from "@/server/authz/policy";
import { NotFoundError } from "@/server/errors";
import { getBalances } from "@/server/services/absences";
import { listEmployeeAssets } from "@/server/services/assets";
import { listDocuments } from "@/server/services/documents";
import { getEmployee, listRates } from "@/server/services/employees";
import { getNotificationSettings } from "@/server/services/notifications";
import { listPayments } from "@/server/services/payments";
import { requestNumber } from "@/server/services/requests";
import { listGrants } from "@/server/services/systems";

type Fact = { icon: IconSvgElement; label: ReactNode; value: ReactNode };

/** Labelled facts with an icon each — the profile's replacement for a bare definition list. */
function Facts({ items }: { items: Fact[] }) {
  return (
    <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
      {items.map((item, i) => (
        <div key={i} className="flex min-w-0 items-start gap-3">
          <IconTile icon={item.icon} tone="neutral" size={32} />
          <div className="min-w-0">
            <dt className="text-xs font-medium text-ink-mute">{item.label}</dt>
            <dd className="text-sm font-medium break-words text-ink-2">{item.value}</dd>
          </div>
        </div>
      ))}
    </dl>
  );
}

/** Contact chip in the profile header. */
function Chip({ icon, children, href }: { icon: IconSvgElement; children: ReactNode; href?: string }) {
  const body = (
    <>
      <HugeiconsIcon icon={icon} size={15} className="shrink-0 text-ink-mute" />
      <span className="truncate">{children}</span>
    </>
  );
  const cls = "inline-flex max-w-full items-center gap-1.5 rounded-full border border-line bg-cream px-3 py-1.5 text-sm text-ink-soft";
  return href ? (
    <a href={href} className={`${cls} transition hover:border-line-strong hover:text-ink`}>
      {body}
    </a>
  ) : (
    <span className={cls}>{body}</span>
  );
}

export default async function EmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getActor();
  const e = await getEmployee(actor, id).catch((err) => {
    if (err instanceof NotFoundError) notFound();
    throw err;
  });
  const t = await getTranslations();
  const locale = await getLocale();
  const target = { employeeId: e.id, departmentId: e.department.id };
  const canEdit = can(actor, "employees.edit", target);
  const canEditRates = can(actor, "rates.edit", target);
  const rates = e.access === "sensitive" ? await listRates(actor, e.id) : [];
  const [grants, assets, documents] =
    e.access === "basic"
      ? [[], [], []]
      : await Promise.all([listGrants(actor, e.id), listEmployeeAssets(actor, e.id), e.access === "sensitive" ? listDocuments(actor, e.id) : []]);
  const balance = e.access === "basic" ? null : await getBalances(actor, e.id);
  const payments = e.access === "sensitive" ? await listPayments(actor, { employeeId: e.id }) : [];
  // channels and the Telegram link are personal: shown on one's own profile only
  const notificationSettings = e.id === actor.employeeId ? await getNotificationSettings(actor) : null;
  const canAdjust = scopeOf(actor, "balances.adjust") === "all";
  const none = t("common.none");
  const fullName = `${e.firstName} ${e.lastName}`;
  const initials = `${e.firstName[0] ?? ""}${e.lastName[0] ?? ""}`.toUpperCase();
  const isMe = e.id === actor.employeeId;

  const jobFacts: Fact[] =
    e.access === "basic"
      ? [
          { icon: Briefcase01Icon, label: t("employee.position"), value: e.position },
          { icon: Building03Icon, label: t("employee.company"), value: e.company.name },
          { icon: HierarchySquare01Icon, label: t("employee.department"), value: e.department.name },
          { icon: BirthdayCakeIcon, label: t("employee.birthday"), value: formatMonthDay(e.birthday, locale) ?? none },
        ]
      : [
          { icon: Briefcase01Icon, label: t("employee.position"), value: e.position },
          { icon: Building03Icon, label: t("employee.company"), value: e.company.name },
          { icon: HierarchySquare01Icon, label: t("employee.department"), value: e.department.name },
          { icon: UserCircleIcon, label: t("employee.manager"), value: e.manager?.name ?? none },
          { icon: Briefcase01Icon, label: t("employee.employmentType"), value: t(`employmentType.${e.employmentType}`) },
          { icon: SlidersHorizontalIcon, label: t("employee.grade"), value: e.grade ? t(`grade.${e.grade}`) : none },
          { icon: Calendar03Icon, label: t("employee.hireDate"), value: formatDate(e.hireDate, locale) ?? none },
          { icon: HourglassIcon, label: t("employee.probationEnd"), value: formatDate(e.probationEnd, locale) ?? none },
          { icon: Location01Icon, label: t("employee.location"), value: e.location ? `${e.location.name} · ${e.location.timezone}` : none },
          { icon: Shield01Icon, label: t("employee.role"), value: e.role ? localized(locale, e.role.nameUk, e.role.nameEn) : none },
        ];

  return (
    <>
      <Link href="/employees" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-ink-soft hover:text-ink">
        <HugeiconsIcon icon={ArrowLeft01Icon} size={16} />
        {t("people2.back")}
      </Link>

      {/* ───────────── header ───────────── */}
      <section className="mb-6 rounded-card border border-edge bg-paper p-5 shadow-[0_1px_1px_rgba(28,39,76,0.04)] sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            {e.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={e.photo} alt="" className="size-16 shrink-0 rounded-full object-cover sm:size-20" />
            ) : (
              <span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-navy text-xl font-bold text-white sm:size-20 sm:text-2xl">{initials}</span>
            )}
            <div className="min-w-0">
              <h1 className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xl leading-tight font-medium tracking-[-0.02em] text-ink sm:text-3xl">
                {fullName}
                {e.access !== "basic" && <Badge tone={statusTone[e.status]}>{t(`status.${e.status}`)}</Badge>}
                {isMe && <Badge tone="ink">{t("people2.you")}</Badge>}
              </h1>
              <p className="mt-1 truncate text-sm text-ink-mute">
                {e.position} · {e.department.name} · {e.company.name}
              </p>
            </div>
          </div>
          {canEdit && (
            <div className="flex flex-wrap items-center gap-2">
              <LinkButton variant="secondary" href={`/employees/${e.id}/edit`}>
                <HugeiconsIcon icon={PencilEdit02Icon} size={17} />
                {t("common.edit")}
              </LinkButton>
              {!isMe && <DeleteEmployeeButton employeeId={e.id} />}
            </div>
          )}
        </div>
        <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
          <Chip icon={Mail01Icon} href={`mailto:${e.workEmail}`}>
            {e.workEmail}
          </Chip>
          {e.access !== "basic" && e.phone && (
            <Chip icon={Call02Icon} href={`tel:${e.phone}`}>
              {e.phone}
            </Chip>
          )}
          {e.access !== "basic" && e.location && <Chip icon={Location01Icon}>{e.location.name}</Chip>}
          {e.access !== "basic" && e.hireDate && <Chip icon={Calendar03Icon}>{t("people2.since", { date: formatDate(e.hireDate, locale) ?? "" })}</Chip>}
        </div>
      </section>

      {/* ───────────── job + personal + rates ───────────── */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card icon={Briefcase01Icon} tone="blue" title={t("people2.job")}>
          <Facts items={jobFacts} />
          {e.access === "basic" && (
            <div className="mt-5">
              <Empty icon={ViewIcon}>{t("employee.basicNotice")}</Empty>
            </div>
          )}
        </Card>

        {e.access !== "basic" && (
          <div className="min-w-0 space-y-6">
            <Card icon={UserCircleIcon} tone="neutral" title={t("people2.personal")}>
              <Facts
                items={[
                  { icon: Call02Icon, label: t("employee.phone"), value: e.phone ?? none },
                  { icon: BirthdayCakeIcon, label: t("employee.birthDate"), value: formatDate(e.birthDate, locale) ?? none },
                  { icon: ViewIcon, label: t("employee.showBirthday"), value: e.showBirthday ? t("common.yes") : t("common.no") },
                  { icon: LanguageSquareIcon, label: t("employee.locale"), value: t(`locales.${e.locale}`) },
                ]}
              />
            </Card>

            {e.access === "sensitive" && (
              <Card
                icon={Wallet01Icon}
                tone="ok"
                title={t("employee.rates")}
                actions={
                  canEditRates && (
                    <ModalButton label={t("employee.addRate")} icon={Add01Icon} variant="secondary" title={t("employee.addRate")} modalIcon={Wallet01Icon}>
                      <RateForm employeeId={e.id} defaultCurrency={rates[0]?.currency} />
                    </ModalButton>
                  )
                }
              >
                <div className="mb-4 rounded-2xl bg-ok-tint px-4 py-3">
                  <p className="text-xs font-medium text-ok-strong">{t("employee.currentRate")}</p>
                  {e.currentRate ? (
                    <p className="mt-1 text-2xl font-bold text-ink-2">
                      {formatMoney(e.currentRate.amount, e.currentRate.currency, locale)}
                      <span className="ml-2 text-sm font-medium text-ink-soft">{t(`rateType.${e.currentRate.rateType}`)}</span>
                    </p>
                  ) : (
                    <p className="mt-1 text-2xl font-bold text-ink-mute">{none}</p>
                  )}
                </div>
                <p className="label mb-2">{t("employee.rateHistory")}</p>
                {rates.length === 0 ? (
                  <Empty icon={Clock01Icon}>{t("employee.noRates")}</Empty>
                ) : (
                  <List>
                    {rates.map((r) => (
                      <ListRow
                        key={r.id}
                        title={formatMoney(r.amount, r.currency, locale)}
                        subtitle={t(`rateType.${r.rateType}`)}
                        trailing={
                          <span className="text-xs text-ink-soft">
                            {formatDate(r.effectiveFrom, locale)}
                            {r.effectiveTo && <span className="block text-ink-mute">→ {formatDate(r.effectiveTo, locale)}</span>}
                          </span>
                        }
                      />
                    ))}
                  </List>
                )}
              </Card>
            )}
          </div>
        )}
      </div>

      {/* ───────────── PTO ───────────── */}
      {balance && (
        <Card
          className="mt-6"
          icon={Calendar03Icon}
          tone="warn"
          title={t("balance.title")}
          actions={
            <>
              {canAdjust && balance.balances.length > 0 && (
                <ModalButton label={t("balance.adjust")} icon={SlidersHorizontalIcon} variant="secondary" title={t("balance.adjust")} subtitle={fullName}>
                  <BalanceAdjustForm employeeId={e.id} types={balance.balances.map((b) => ({ id: b.type.id, name: localized(locale, b.type.nameUk, b.type.nameEn) }))} />
                </ModalButton>
              )}
              {isMe && (
                <LinkButton href="/requests/new">
                  <HugeiconsIcon icon={Add01Icon} size={17} />
                  {t("balance.request")}
                </LinkButton>
              )}
            </>
          }
        >
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="min-w-0">
              <p className="label mb-3">{t("balance.balance")}</p>
              <BalanceList eligible={balance.eligible} balances={balance.balances} locale={locale} />
            </div>
            <div className="min-w-0 lg:border-l lg:border-line lg:pl-6">
              <p className="label mb-3">{t("balance.absences")}</p>
              {balance.absences.length === 0 ? (
                <Empty icon={Calendar03Icon}>{t("balance.noAbsences")}</Empty>
              ) : (
                <List>
                  {balance.absences.slice(0, 12).map((a) => (
                    <ListRow
                      key={a.id}
                      leading={<DateLeaf iso={a.from} locale={locale} />}
                      title={
                        <span className={`flex items-center gap-1.5 ${a.status === "cancelled" ? "text-ink-mute line-through" : ""}`}>
                          <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: a.type.color }} />
                          {localized(locale, a.type.nameUk, a.type.nameEn)}
                        </span>
                      }
                      subtitle={`${formatDate(a.from, locale)}${a.to !== a.from ? ` — ${formatDate(a.to, locale)}` : ""} · ${t("balance.days", { n: a.days })}`}
                      trailing={
                        a.status === "cancelled" ? <Badge>{t("balance.cancelled")}</Badge> : a.status === "approved" && canAdjust ? <CancelAbsenceButton absenceId={a.id} /> : undefined
                      }
                    />
                  ))}
                </List>
              )}
            </div>
            <div className="min-w-0 lg:border-l lg:border-line lg:pl-6">
              <p className="label mb-3">{t("balance.ledger")}</p>
              {balance.entries.length === 0 ? (
                <Empty icon={Clock01Icon}>{t("people2.noLedger")}</Empty>
              ) : (
                <ul className="max-h-72 divide-y divide-line overflow-auto pr-1 text-sm">
                  {balance.entries.map((x) => (
                    <li key={x.id} className="flex items-center justify-between gap-3 py-2">
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 font-medium text-ink-2">
                          <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: x.absenceType.color }} />
                          <span className="truncate">{t(`balance.types.${x.type}`)}</span>
                        </span>
                        <span className="block truncate text-xs text-ink-mute">
                          {formatDate(x.date, locale)} · {localized(locale, x.absenceType.nameUk, x.absenceType.nameEn)}
                          {x.comment && x.type === "manual_adjustment" && ` · ${x.comment}`}
                        </span>
                      </span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-xs font-bold ${x.amount < 0 ? "bg-red-tint text-red-strong" : "bg-ok-tint text-ok-strong"}`}>
                        {x.amount > 0 ? "+" : ""}
                        {x.amount}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* ───────────── access, assets, documents ───────────── */}
      {e.access !== "basic" && (
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <Card icon={sectionIcons.systems} tone="blue" title={t("profile.accesses")}>
            {grants.length === 0 ? (
              <Empty icon={sectionIcons.systems}>{t("profile.noAccesses")}</Empty>
            ) : (
              <List>
                {grants.map((g) => (
                  <ListRow
                    key={g.id}
                    title={<span className={g.revokedAt ? "text-ink-mute line-through" : ""}>{g.systemName}</span>}
                    subtitle={g.revokedAt ? `${g.accessLevel} · ${t("profile.revoked")}` : g.accessLevel}
                    trailing={
                      g.request && (
                        <Link className="font-mono text-xs text-red hover:text-red-strong" href={`/requests/${g.request.id}`}>
                          {requestNumber(g.request.number)}
                        </Link>
                      )
                    }
                  />
                ))}
              </List>
            )}
          </Card>

          <Card icon={LaptopIcon} tone="neutral" title={t("profile.assets")}>
            {assets.length === 0 ? (
              <Empty icon={LaptopIcon}>{t("profile.noAssets")}</Empty>
            ) : (
              <List>
                {assets.map((a) => (
                  <ListRow key={a.id} leading={<IconTile icon={LaptopIcon} tone="neutral" size={32} />} title={a.name} subtitle={[t(`assets.type.${a.type}`), a.serialOrSeat].filter(Boolean).join(" · ")} />
                ))}
              </List>
            )}
          </Card>

          {e.access === "sensitive" && (
            <Card
              icon={File01Icon}
              tone="warn"
              title={t("profile.documents")}
              actions={
                canEdit && (
                  <ModalButton iconOnly icon={Upload04Icon} label={t("profile.uploadDocument")} title={t("profile.uploadDocument")} subtitle={fullName} modalIcon={File01Icon}>
                    <DocumentUpload employeeId={e.id} />
                  </ModalButton>
                )
              }
            >
              {documents.length === 0 ? (
                <Empty icon={File01Icon}>{t("profile.noDocuments")}</Empty>
              ) : (
                <List>
                  {documents.map((d) => (
                    <ListRow
                      key={d.id}
                      leading={<IconTile icon={File01Icon} tone={d.status === "expired" ? "red" : "neutral"} size={32} />}
                      title={
                        <a className="hover:text-red" href={d.url}>
                          {t(`profile.docType.${d.type}`)} · {d.fileName}
                        </a>
                      }
                      subtitle={
                        d.validTo && (
                          <span className={d.status === "expired" ? "text-red-strong" : undefined}>
                            {t("profile.validTo")}: {formatDate(d.validTo, locale)}
                            {d.status === "expired" && ` · ${t("profile.expired")}`}
                          </span>
                        )
                      }
                    />
                  ))}
                </List>
              )}
            </Card>
          )}
        </div>
      )}

      {payments.length > 0 && (
        <div className="mt-6">
          <PaymentsTable payments={payments} canManage={false} periodLocked title={t("payments.myPayments")} />
        </div>
      )}

      {notificationSettings && (
        <Card className="mt-6" icon={Notification02Icon} tone="blue" title={t("notifications.settings")} subtitle={t("people2.notificationsHint")}>
          <NotificationSettings initial={notificationSettings} />
        </Card>
      )}
    </>
  );
}
