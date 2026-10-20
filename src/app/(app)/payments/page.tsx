import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { CoefficientForm, NewPeriodForm, PaymentsTable, PeriodActions } from "@/components/money/payments-board";
import { Badge, buttonClass, Card, PageTitle } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { getActor } from "@/server/auth/session";
import { employeeScopeWhere, scopeOf } from "@/server/authz/policy";
import { getOrgStructure } from "@/server/services/org";
import { listBonuses, listPayments, listPeriods, listShiftCoefficients } from "@/server/services/payments";
import { notFound } from "next/navigation";

const FILTERS = ["all", "waiting_documents", "waiting_approval", "unpaid"] as const;

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ period?: string; filter?: string; days?: string }> }) {
  const actor = await getActor();
  const manage = scopeOf(actor, "payments.manage") === "all";
  if (!manage && !employeeScopeWhere(actor, "employees.view_sensitive")) notFound();
  const sp = await searchParams;
  const filter = (FILTERS as readonly string[]).includes(sp.filter ?? "") ? (sp.filter as (typeof FILTERS)[number]) : "all";
  const days = Number(sp.days ?? 14) || 14;
  const [t, locale] = await Promise.all([getTranslations("payments"), getLocale()]);

  if (!manage) {
    // people without payments.manage see their own (and their departments') payments only
    const own = await listPayments(actor, {});
    return (
      <>
        <PageTitle>{t("title")}</PageTitle>
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

  return (
    <>
      <PageTitle>{t("title")}</PageTitle>
      <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        <div className="space-y-6">
          <Card title={t("periods")}>
            <ul className="mb-4 space-y-2 text-sm">
              {periods.map((p) => (
                <li key={p.id}>
                  <Link href={qs({ period: p.id })} className={`flex items-center justify-between gap-2 rounded-md px-2 py-1.5 ${p.id === current?.id ? "bg-ink text-cream" : "hover:bg-cream-deep"}`}>
                    <span>
                      <span className="font-medium">{p.company.name}</span> · {formatDate(p.periodStart, locale)} — {formatDate(p.periodEnd, locale)}
                      <span className="block text-xs opacity-75">{p.totals.map((x) => `${x.total} ${x.currency}`).join(" · ")}</span>
                    </span>
                    <Badge tone={p.status === "locked" ? "neutral" : p.status === "calculated" ? "ok" : "warn"}>{t(`periodStatus.${p.status}`)}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
            <NewPeriodForm companies={org.companies} />
          </Card>
          <Card title={t("coefficients")}>
            <p className="mb-2 text-xs text-ink-mute">{t("coefficientHint")}</p>
            {coefficients.map((c) => (
              <CoefficientForm key={c.id} company={c} />
            ))}
          </Card>
          <Card title={t("bonuses")}>
            <ul className="space-y-1 text-sm">
              {bonuses.map((b) => (
                <li key={b.id} className="flex justify-between gap-2">
                  <span>
                    {b.employee} · {b.period}
                    <span className="block text-xs text-ink-mute">{b.reason}</span>
                  </span>
                  <span className="text-right">
                    <span className="font-mono">
                      {b.amount} {b.currency}
                    </span>
                    <span className="block text-xs text-ink-mute">{t(`bonusStatus.${b.status}`)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {FILTERS.map((f) => (
              <Link key={f} href={qs({ filter: f })} className={`rounded-md px-3 py-1.5 ${filter === f ? "bg-ink text-cream" : "bg-paper text-ink-soft hover:text-ink"}`}>
                {t(`filters.${f}`)}
              </Link>
            ))}
            {filter === "unpaid" && <span className="text-xs text-ink-mute">{t("unpaidDays", { days })}</span>}
          </div>
          {current && (
            <Card
              title={`${current.company.name} · ${formatDate(current.periodStart, locale)} — ${formatDate(current.periodEnd, locale)}`}
              actions={
                <div className="flex gap-2">
                  <a className={buttonClass("ghost")} href={`/api/v1/payments/periods/${current.id}/export?format=csv`}>
                    {t("exportCsv")}
                  </a>
                  <a className={buttonClass("ghost")} href={`/api/v1/payments/periods/${current.id}/export?format=xlsx`}>
                    {t("exportXlsx")}
                  </a>
                </div>
              }
            >
              <PeriodActions periodId={current.id} status={current.status} />
            </Card>
          )}
          <PaymentsTable payments={payments} canManage periodLocked={current?.status === "locked"} />
        </div>
      </div>
    </>
  );
}
