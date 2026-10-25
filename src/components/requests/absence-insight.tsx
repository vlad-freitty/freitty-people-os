"use client";

import { Alert02Icon, Calendar03Icon, Clock01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { formatDate } from "@/lib/format";
import { api } from "../api";
import { IconTile } from "../ui";

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
  const t2 = useTranslations("requests2");
  return (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-2 gap-2">
        <Tile label={t2("insightSince")} value={insight.last ? t2("daysUnit", { n: insight.last.daysSince }) : t2("none")} />
        <Tile label={t2("insightDays")} value={insight.days != null ? t2("daysUnit", { n: insight.days }) : t2("none")} />
        {insight.balance != null && (
          <Tile label={t2("insightBalance")} value={t2("daysUnit", { n: insight.balance })} tone={insight.balance < 0 ? "red" : "neutral"} />
        )}
      </div>
      <p className="flex items-start gap-2 text-ink-soft">
        <HugeiconsIcon icon={Clock01Icon} size={16} className="mt-0.5 shrink-0 text-ink-mute" />
        <span>
          {insight.last
            ? t("last", { n: insight.last.daysSince, from: date(insight.last.from), to: date(insight.last.to) })
            : t("lastNone")}
        </span>
      </p>
      {showWarnings && insight.warnings.length > 0 && (
        <ul className="space-y-1.5">
          {insight.warnings.map((w) => (
            <li key={w.code} className="flex items-start gap-2 rounded-xl bg-warn-tint px-3 py-2 text-warn">
              <HugeiconsIcon icon={Alert02Icon} size={16} className="mt-0.5 shrink-0" />
              <span>
                {t(`warnings.${w.code}` as "warnings.no_policy", {
                  n: Number(w.n ?? 0),
                  balance: Number(w.balance ?? 0),
                  date: typeof w.date === "string" ? date(w.date) : "",
                })}
              </span>
            </li>
          ))}
        </ul>
      )}
      {showWarnings && insight.warnings.length > 0 && <p className="text-xs text-ink-mute">{t("hint")}</p>}
    </div>
  );
}

/** Small number tile inside the insight block. */
function Tile({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "red" }) {
  return (
    <div className="rounded-xl bg-cream px-3 py-2.5">
      <p className="text-xs text-ink-mute">{label}</p>
      <p className={`mt-0.5 text-lg leading-tight font-bold ${tone === "red" ? "text-red" : "text-ink-2"}`}>{value}</p>
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
    <div className="rounded-2xl border border-warn/20 bg-paper p-4">
      <p className="mb-3 flex items-center gap-2 text-sm font-bold text-ink-2">
        <IconTile icon={Calendar03Icon} tone="warn" size={28} />
        {t("title")}
      </p>
      <AbsenceInsightView insight={insight} />
    </div>
  );
}
