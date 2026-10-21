import { getTranslations } from "next-intl/server";
import { formatDate, localized } from "@/lib/format";

export type BalanceRow = {
  type: { id: string; code: string; nameUk: string; nameEn: string | null; color: string; countsAsWorking: boolean };
  policy: { name: string; periodStart: string } | null;
  balance: number;
  period: { start: string; end: string } | null;
};

/** Balances of every PTO type (phase 6): name, days left, until when they can be used. */
export async function BalanceList({ eligible, balances, locale }: { eligible: boolean; balances: BalanceRow[]; locale: string }) {
  const t = await getTranslations("balance");
  if (!eligible) return <p className="text-sm text-ink-mute">{t("notEligible")}</p>;
  if (balances.length === 0) return <p className="text-sm text-ink-mute">{t("noTypes")}</p>;
  return (
    <ul className="divide-y divide-line">
      {balances.map((b) => (
        <li key={b.type.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
          <span className="min-w-0">
            <span className="flex items-center gap-2 text-sm font-medium text-ink-2">
              <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: b.type.color }} aria-hidden />
              <span className="truncate">{localized(locale, b.type.nameUk, b.type.nameEn)}</span>
            </span>
            <span className="block truncate pl-4 text-xs text-ink-mute">
              {!b.policy ? t("noPolicy") : b.period ? t(b.policy.periodStart === "month" ? "thisMonthUntil" : "until", { date: formatDate(b.period.end, locale) ?? "" }) : b.policy.name}
            </span>
          </span>
          <span className={`shrink-0 text-lg font-bold ${b.balance < 0 ? "text-red" : "text-ink-2"}`}>{t("days", { n: b.balance })}</span>
        </li>
      ))}
    </ul>
  );
}
