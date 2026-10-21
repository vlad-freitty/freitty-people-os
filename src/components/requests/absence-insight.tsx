"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { formatDate } from "@/lib/format";
import { api } from "../api";

export type AbsenceInsightDto = {
  typeId: string;
  days: number | null;
  balance: number | null;
  warnings: ({ code: string } & Record<string, string | number>)[];
  last: { from: string; to: string; daysSince: number } | null;
  error: Record<string, string> | null;
};

/**
 * Days since the last absence of the same type, the balance of that type and the policy warnings (phase 6).
 * Warnings never block — approvers decide.
 */
export function AbsenceInsightView({ insight, showWarnings = true }: { insight: AbsenceInsightDto; showWarnings?: boolean }) {
  const t = useTranslations("absenceInsight");
  const locale = useLocale();
  const date = (iso: string) => formatDate(iso, locale) ?? iso;
  return (
    <div className="space-y-2 text-sm">
      <p className="font-medium text-ink-2">
        {insight.last
          ? t("last", { n: insight.last.daysSince, from: date(insight.last.from), to: date(insight.last.to) })
          : t("lastNone")}
      </p>
      {insight.days != null && (
        <p className="text-ink-soft">
          {t("days", { n: insight.days })}
          {insight.balance != null && <> · {t("balance", { n: insight.balance })}</>}
        </p>
      )}
      {showWarnings && insight.warnings.length > 0 && (
        <ul className="space-y-1">
          {insight.warnings.map((w) => (
            <li key={w.code} className="rounded-xl bg-warn-tint px-3 py-1.5 text-warn">
              {t(`warnings.${w.code}` as "warnings.no_policy", {
                n: Number(w.n ?? 0),
                balance: Number(w.balance ?? 0),
                date: typeof w.date === "string" ? date(w.date) : "",
              })}
            </li>
          ))}
        </ul>
      )}
      {showWarnings && insight.warnings.length > 0 && <p className="text-xs text-ink-mute">{t("hint")}</p>}
    </div>
  );
}

/** Live preview in the new-request form: re-asks the server when the type or the dates change. */
export function AbsenceInsightPreview({ values }: { values: Record<string, unknown> }) {
  const t = useTranslations("absenceInsight");
  const [insight, setInsight] = useState<AbsenceInsightDto | null>(null);
  const dates = values.dates as { from?: string; to?: string } | undefined;
  const key = JSON.stringify([values.absence_type, dates?.from, dates?.to, values.half_day, !!values.document]);
  useEffect(() => {
    const [type, from, to] = JSON.parse(key) as [unknown, string | undefined, string | undefined];
    if (typeof type !== "string" || !from || !to) {
      setInsight(null);
      return;
    }
    let live = true;
    const timer = setTimeout(() => {
      api<AbsenceInsightDto | null>("/absences/preview", { body: values })
        .then((r) => live && setInsight(r))
        .catch(() => live && setInsight(null));
    }, 300);
    return () => {
      live = false;
      clearTimeout(timer);
    };
    // values is read through key, which changes whenever a relevant field does
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (!insight) return null;
  return (
    <div className="rounded-card border border-edge bg-cream p-4">
      <p className="label">{t("title")}</p>
      <AbsenceInsightView insight={insight} />
    </div>
  );
}
