import { Add01Icon, Calendar03Icon, Download04Icon, GiftIcon, PercentIcon, Wallet01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { sectionIcons } from "@/components/icons";
import { CoefficientForm, NewPeriodForm, PaymentsTable, PeriodActions } from "@/components/money/payments-board";
import { ModalButton } from "@/components/overlay";
import { Avatar, Badge, buttonClass, Card, Empty, PageTitle, Stat } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { getActor } from "@/server/auth/session";
import { employeeScopeWhere, scopeOf } from "@/server/authz/policy";
import { getOrgStructure } from "@/server/services/org";
import { listBonuses, listPayments, listPeriods, listShiftCoefficients } from "@/server/services/payments";

const FILTERS = ["all", "waiting_documents", "waiting_approval", "unpaid"] as const;

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ period?: string; filter?: string; days?: string }> }) {
  const actor = await getActor();
  const manage = scopeOf(actor, "payments.manage") === "all";
  if (!manage && !employeeScopeWhere(actor, "employees.view_sensitive")) notFound();
  const sp = await searchParams;
  const filter = (FILTERS as readonly string[]).includes(sp.filter ?? "") ? (sp.filter as (typeof FILTERS)[number]) : "all";
  const days = Number(sp.days ?? 14) || 14;
  const [t, to, locale] = await Promise.all([getTranslations("payments"), getTranslations("ops2"), getLocale()]);

  if (!manage) {
    // people without payments.manage see their own (and their departments') payments only
    const own = await listPayments(actor, {});
    return (
      <>
        <PageTitle icon={sectionIcons.payments} subtitle={to("paymentsOwnSubtitle")}>
          {t("title")}
        </PageTitle>
        <PaymentsTable payments={own} canManage={false} periodLocked />
      </>
    );
  }

  const [periods, org, coefficients, bonuses] = await Promise.all([listPeriods(actor), getOrgStructure(actor), listShiftCoefficients(actor), listBonuses(actor)]);
  const current = periods.find((p) => p.id === sp.period) ?? null;
  const payments = await listPayments(actor, { periodId: current?.id, filter: filter === "all" ? undefined : filter, days });
  const qs = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams(Object.entries({ period: current?.id, filter, days: String(days), ...patch }).filter(([, v]) => v && v !== "all") as [string, string][]);
    return `/payments?${params}`;
  };
  const count = (fn: (p: (typeof payments)[number]) => boolean) => payments.filter(fn).length;

  return (
    <>
      <PageTitle
        icon={sectionIcons.payments}
        subtitle={to("paymentsSubtitle")}
        actions={
          <ModalButton label={t("newPeriod")} icon={Add01Icon} title={t("newPeriod")} modalIcon={Calendar03Icon}>
            <NewPeriodForm companies={org.companies} />
          </ModalButton>
        }
      >
        {t("title")}
      </PageTitle>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={to("paymentsTotal")} value={payments.length} />
        <Stat label={to("waitingDocs")} value={count((p) => p.employee.employmentType === "contractor" && !p.documentOk && p.status !== "paid")} tone="red" />
        <Stat label={to("waitingApproval")} value={count((p) => p.status === "calculated" || p.status === "documents_received")} tone="warn" />
        <Stat label={t("status.paid")} value={count((p) => p.status === "paid")} tone="ok" />
      </div>

      {/* periods, coefficients and bonuses in a row; the payments table below gets the full width */}
      <div className="space-y-6">
        <div className="grid min-w-0 gap-6 lg:grid-cols-3 lg:items-start">
          <Card icon={Calendar03Icon} tone="blue" title={t("periods")} subtitle={to("periodsHint")}>
            {periods.length === 0 ? (
              <Empty icon={Calendar03Icon}>{to("noPeriods")}</Empty>
            ) : (
              <ul className="-mx-2 space-y-1">
                {periods.map((p) => {
                  const active = p.id === current?.id;
                  return (
                    <li key={p.id}>
                      <Link
                        href={qs({ period: p.id })}
                        className={`flex items-center justify-between gap-2 rounded-2xl px-3 py-2.5 text-sm transition ${active ? "bg-navy text-white" : "hover:bg-cream"}`}
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-bold">{p.company.name}</span>
                          <span className={`block truncate text-xs ${active ? "text-white/75" : "text-ink-mute"}`}>
                            {formatDate(p.periodStart, locale)} — {formatDate(p.periodEnd, locale)}
                          </span>
                          {p.totals.length > 0 && (
                            <span className={`block truncate font-mono text-xs ${active ? "text-white/90" : "text-ink-soft"}`}>{p.totals.map((x) => `${x.total} ${x.currency}`).join(" · ")}</span>
                          )}
                        </span>
                        <Badge tone={p.status === "locked" ? "neutral" : p.status === "calculated" ? "ok" : "warn"}>{t(`periodStatus.${p.status}`)}</Badge>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card icon={PercentIcon} tone="warn" title={t("coefficients")} subtitle={t("coefficientHint")}>
            <div className="-my-2.5 divide-y divide-line">
              {coefficients.map((c) => (
                <CoefficientForm key={c.id} company={c} />
              ))}
            </div>
          </Card>

          <Card icon={GiftIcon} tone="warn" title={t("bonuses")}>
            {bonuses.length === 0 ? (
              <Empty icon={GiftIcon}>{to("noBonuses")}</Empty>
            ) : (
              <ul className="-my-2 divide-y divide-line">
                {bonuses.map((b) => (
                  <li key={b.id} className="flex items-center gap-3 py-2.5">
                    <Avatar name={b.employee} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink-2">{b.employee}</span>
                      <span className="block truncate text-xs text-ink-mute">
                        {b.period}
                        {b.reason && ` · ${b.reason}`}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block font-mono text-sm font-bold text-ink-2">
                        {b.amount} {b.currency}
                      </span>
                      <span className="block text-xs text-ink-mute">{t(`bonusStatus.${b.status}`)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {FILTERS.map((f) => (
              <Link
                key={f}
                href={qs({ filter: f })}
                className={`rounded-full border px-3.5 py-1.5 font-medium transition ${filter === f ? "border-navy bg-navy text-white" : "border-line-strong bg-paper text-ink-soft hover:text-ink"}`}
              >
                {t(`filters.${f}`)}
              </Link>
            ))}
            {filter === "unpaid" && <span className="text-xs text-ink-mute">{t("unpaidDays", { days })}</span>}
          </div>
          {current ? (
            <Card
              icon={Wallet01Icon}
              tone="navy"
              title={current.company.name}
              subtitle={`${formatDate(current.periodStart, locale)} — ${formatDate(current.periodEnd, locale)} · ${t(`periodStatus.${current.status}`)}`}
              actions={
                <>
                  <a className={buttonClass("secondary")} href={`/api/v1/payments/periods/${current.id}/export?format=csv`}>
                    <HugeiconsIcon icon={Download04Icon} size={16} />
                    {t("exportCsv")}
                  </a>
                  <a className={buttonClass("secondary")} href={`/api/v1/payments/periods/${current.id}/export?format=xlsx`}>
                    <HugeiconsIcon icon={Download04Icon} size={16} />
                    {t("exportXlsx")}
                  </a>
                </>
              }
            >
              {current.status === "locked" ? <Empty icon={Wallet01Icon}>{to("periodLocked")}</Empty> : <PeriodActions periodId={current.id} status={current.status} />}
            </Card>
          ) : (
            periods.length > 0 && <Empty icon={Calendar03Icon}>{to("pickPeriod")}</Empty>
          )}
          <PaymentsTable payments={payments} canManage periodLocked={current?.status === "locked"} />
        </div>
      </div>
    </>
  );
}
