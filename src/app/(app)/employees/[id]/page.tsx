import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { DeleteEmployeeButton } from "@/components/delete-employee";
import { RateForm } from "@/components/rate-form";
import { Badge, Card, DefinitionList, LinkButton, PageTitle, statusTone } from "@/components/ui";
import { formatDate, formatMoney, formatMonthDay, localized } from "@/lib/format";
import { getActor } from "@/server/auth/session";
import { can, scopeOf } from "@/server/authz/policy";
import { getBalance } from "@/server/services/absences";
import { listPayments } from "@/server/services/payments";
import { getNotificationSettings } from "@/server/services/notifications";
import { NotificationSettings } from "@/components/notification-settings";
import { PaymentsTable } from "@/components/money/payments-board";
import { BalanceAdjustForm, CancelAbsenceButton } from "@/components/balance-actions";
import { NotFoundError } from "@/server/errors";
import { getEmployee, listRates } from "@/server/services/employees";
import { listEmployeeAssets } from "@/server/services/assets";
import { listDocuments } from "@/server/services/documents";
import { requestNumber } from "@/server/services/requests";
import { listGrants } from "@/server/services/systems";
import Link from "next/link";
import { DocumentUpload } from "@/components/directories";

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
  const balance = e.access === "basic" ? null : await getBalance(actor, e.id);
  const payments = e.access === "sensitive" ? await listPayments(actor, { employeeId: e.id }) : [];
  // channels and the Telegram link are personal: shown on one's own profile only
  const notificationSettings = e.id === actor.employeeId ? await getNotificationSettings(actor) : null;
  const canAdjust = scopeOf(actor, "balances.adjust") === "all";
  const none = t("common.none");

  const basicItems = [
    { label: t("employee.position"), value: e.position },
    { label: t("employee.company"), value: e.company.name },
    { label: t("employee.department"), value: e.department.name },
    { label: t("employee.workEmail"), value: <a className="underline" href={`mailto:${e.workEmail}`}>{e.workEmail}</a> },
    { label: t("employee.birthday"), value: formatMonthDay(e.birthday, locale) ?? none },
  ];

  return (
    <>
      <PageTitle
        actions={
          <div className="flex items-center gap-2">
            {canEdit && <LinkButton variant="secondary" href={`/employees/${e.id}/edit`}>{t("common.edit")}</LinkButton>}
            {canEdit && e.id !== actor.employeeId && <DeleteEmployeeButton employeeId={e.id} />}
          </div>
        }
      >
        <span className="flex items-center gap-4">
          {e.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={e.photo} alt="" className="h-14 w-14 rounded-full object-cover" />
          ) : (
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-cream-deep text-xl font-bold text-ink">
              {e.firstName[0]}
              {e.lastName[0]}
            </span>
          )}
          <span>
            {e.firstName} {e.lastName}
            {e.access !== "basic" && (
              <span className="ml-3 align-middle">
                <Badge tone={statusTone[e.status]}>{t(`status.${e.status}`)}</Badge>
              </span>
            )}
          </span>
        </span>
      </PageTitle>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card title={t("employee.profile")}>
          {e.access === "basic" ? (
            <>
              <DefinitionList items={basicItems} />
              <p className="mt-4 text-xs text-ink-mute">{t("employee.basicNotice")}</p>
            </>
          ) : (
            <DefinitionList
              items={[
                ...basicItems.slice(0, 4),
                { label: t("employee.phone"), value: e.phone ?? none },
                { label: t("employee.location"), value: e.location ? `${e.location.name} · ${e.location.timezone}` : none },
                { label: t("employee.manager"), value: e.manager?.name ?? none },
                { label: t("employee.employmentType"), value: t(`employmentType.${e.employmentType}`) },
                { label: t("employee.hireDate"), value: formatDate(e.hireDate, locale) ?? none },
                { label: t("employee.probationEnd"), value: formatDate(e.probationEnd, locale) ?? none },
                { label: t("employee.birthDate"), value: formatDate(e.birthDate, locale) ?? none },
                { label: t("employee.showBirthday"), value: e.showBirthday ? t("common.yes") : t("common.no") },
                { label: t("employee.locale"), value: t(`locales.${e.locale}`) },
                { label: t("employee.role"), value: e.role ? localized(locale, e.role.nameUk, e.role.nameEn) : none },
              ]}
            />
          )}
        </Card>

        {e.access === "sensitive" && (
          <Card title={t("employee.rates")}>
            <p className="label">{t("employee.currentRate")}</p>
            <p className="mb-4 text-2xl font-bold text-ink-2">
              {e.currentRate ? (
                <>
                  {formatMoney(e.currentRate.amount, e.currentRate.currency, locale)}
                  <span className="ml-2 text-sm text-ink-soft">{t(`rateType.${e.currentRate.rateType}`)}</span>
                </>
              ) : (
                none
              )}
            </p>
            <p className="label">{t("employee.rateHistory")}</p>
            {rates.length === 0 ? (
              <p className="text-sm text-ink-mute">{t("employee.noRates")}</p>
            ) : (
              <table className="table mb-4">
                <thead>
                  <tr>
                    <th>{t("employee.effectiveFrom")}</th>
                    <th>{t("employee.amount")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rates.map((r) => (
                    <tr key={r.id}>
                      <td>
                        {formatDate(r.effectiveFrom, locale)}
                        <span className="block text-xs text-ink-mute">
                          {r.effectiveTo ? `→ ${formatDate(r.effectiveTo, locale)}` : ""}
                        </span>
                      </td>
                      <td>
                        {formatMoney(r.amount, r.currency, locale)}
                        <span className="block text-xs text-ink-mute">{t(`rateType.${r.rateType}`)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {canEditRates && <RateForm employeeId={e.id} defaultCurrency={rates[0]?.currency} />}
          </Card>
        )}
      </div>

      {balance && (
        <Card className="mt-6" title={t("balance.title")} actions={e.id === actor.employeeId && <LinkButton variant="secondary" href="/requests/new">{t("balance.request")}</LinkButton>}>
          <div className="grid gap-6 lg:grid-cols-[1fr_2fr_2fr]">
            <div>
              <p className="label">{t("balance.balance")}</p>
              <p className="text-[28px] leading-tight font-bold text-ink-2">{t("balance.days", { n: balance.balance })}</p>
              <p className="mt-1 text-xs text-ink-mute">
                {balance.policy ? `${t("balance.policy")}: ${balance.policy.name}` : t("balance.noPolicy")}
              </p>
            </div>
            <div>
              <p className="label">{t("balance.absences")}</p>
              {balance.absences.length === 0 ? (
                <p className="text-sm text-ink-mute">{t("balance.noAbsences")}</p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {balance.absences.slice(0, 12).map((a) => (
                    <li key={a.id} className={`flex items-center justify-between gap-2 ${a.status === "cancelled" ? "text-ink-mute line-through" : ""}`}>
                      <span>
                        <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: a.type.color }} />
                        {localized(locale, a.type.nameUk, a.type.nameEn)} · {formatDate(a.from, locale)}
                        {a.to !== a.from && <> — {formatDate(a.to, locale)}</>} · {t("balance.days", { n: a.days })}
                      </span>
                      {a.status === "approved" && canAdjust && <CancelAbsenceButton absenceId={a.id} />}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="label">{t("balance.ledger")}</p>
              <ul className="max-h-56 space-y-1 overflow-auto text-xs">
                {balance.entries.map((x) => (
                  <li key={x.id} className="flex justify-between gap-2 border-b border-line/50 pb-1">
                    <span>
                      {formatDate(x.date, locale)} · {t(`balance.types.${x.type}`)}
                      {x.comment && x.type === "manual_adjustment" && <span className="text-ink-mute"> · {x.comment}</span>}
                    </span>
                    <span className={`font-mono ${x.amount < 0 ? "text-red-strong" : "text-ok"}`}>
                      {x.amount > 0 ? "+" : ""}
                      {x.amount}
                    </span>
                  </li>
                ))}
              </ul>
              {canAdjust && <BalanceAdjustForm employeeId={e.id} />}
            </div>
          </div>
        </Card>
      )}

      {notificationSettings && (
        <Card className="mt-6" title={t("notifications.settings")}>
          <NotificationSettings initial={notificationSettings} />
        </Card>
      )}

      {payments.length > 0 && (
        <Card className="mt-6" title={t("payments.myPayments")}>
          <PaymentsTable payments={payments} canManage={false} periodLocked />
        </Card>
      )}

      {e.access !== "basic" && (
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <Card title={t("profile.accesses")}>
            {grants.length === 0 ? (
              <p className="text-sm text-ink-mute">{t("profile.noAccesses")}</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {grants.map((g) => (
                  <li key={g.id} className={`flex justify-between gap-2 ${g.revokedAt ? "text-ink-mute line-through" : ""}`}>
                    <span>
                      {g.systemName} · <span className="text-ink-soft">{g.accessLevel}</span>
                    </span>
                    {g.request && (
                      <Link className="font-mono text-xs underline" href={`/requests/${g.request.id}`}>
                        {requestNumber(g.request.number)}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title={t("profile.assets")}>
            {assets.length === 0 ? (
              <p className="text-sm text-ink-mute">{t("profile.noAssets")}</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {assets.map((a) => (
                  <li key={a.id}>
                    <Badge>{t(`assets.type.${a.type}`)}</Badge> {a.name}
                    {a.serialOrSeat && <span className="block font-mono text-xs text-ink-mute">{a.serialOrSeat}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {e.access === "sensitive" && (
            <Card title={t("profile.documents")}>
              {documents.length === 0 ? (
                <p className="mb-3 text-sm text-ink-mute">{t("profile.noDocuments")}</p>
              ) : (
                <ul className="mb-3 space-y-2 text-sm">
                  {documents.map((d) => (
                    <li key={d.id}>
                      <a className="underline" href={d.url}>
                        {t(`profile.docType.${d.type}`)} · {d.fileName}
                      </a>
                      {d.validTo && (
                        <span className={`block text-xs ${d.status === "expired" ? "text-red-strong" : "text-ink-mute"}`}>
                          {t("profile.validTo")}: {formatDate(d.validTo, locale)}
                          {d.status === "expired" && <> · {t("profile.expired")}</>}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {canEdit && <DocumentUpload employeeId={e.id} />}
            </Card>
          )}
        </div>
      )}
    </>
  );
}
