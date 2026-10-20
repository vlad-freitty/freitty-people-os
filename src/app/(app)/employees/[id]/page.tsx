import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { DeleteEmployeeButton } from "@/components/delete-employee";
import { RateForm } from "@/components/rate-form";
import { Badge, Card, DefinitionList, LinkButton, PageTitle, statusTone } from "@/components/ui";
import { formatDate, formatMoney, formatMonthDay, localized } from "@/lib/format";
import { getActor } from "@/server/auth/session";
import { can } from "@/server/authz/policy";
import { NotFoundError } from "@/server/errors";
import { getEmployee, listRates } from "@/server/services/employees";

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
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-ink font-display text-xl text-cream">
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
            <p className="mb-4 font-display text-2xl">
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
    </>
  );
}
