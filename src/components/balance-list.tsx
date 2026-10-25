import { Calendar03Icon, Home01Icon, InformationCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { getTranslations } from "next-intl/server";
import { formatDate, localized } from "@/lib/format";
import { Empty } from "./ui";

export type BalanceRow = {
  type: { id: string; code: string; nameUk: string; nameEn: string | null; color: string; countsAsWorking: boolean };
  policy: { name: string; periodStart: string } | null;
  balance: number;
  period: { start: string; end: string } | null;
};

/** Balances of every PTO type (phase 6): name, days left, until when they can be used. */
export async function BalanceList({ eligible, balances, locale }: { eligible: boolean; balances: BalanceRow[]; locale: string }) {
  const t = await getTranslations("balance");
  if (!eligible) return <Empty icon={InformationCircleIcon}>{t("notEligible")}</Empty>;
  if (balances.length === 0) return <Empty icon={InformationCircleIcon}>{t("noTypes")}</Empty>;
  return (
    <ul className="-my-2 divide-y divide-line">
      {balances.map((b) => (
        <li key={b.type.id} className="flex items-center justify-between gap-3 py-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: `${b.type.color}22`, color: b.type.color }} aria-hidden>
            <HugeiconsIcon icon={b.type.countsAsWorking ? Home01Icon : Calendar03Icon} size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-ink-2">{localized(locale, b.type.nameUk, b.type.nameEn)}</span>
            <span className="block truncate text-xs text-ink-mute">
              {!b.policy ? t("noPolicy") : b.period ? t(b.policy.periodStart === "month" ? "thisMonthUntil" : "until", { date: formatDate(b.period.end, locale) ?? "" }) : b.policy.name}
            </span>
          </span>
          <span className={`shrink-0 text-lg font-bold ${b.balance < 0 ? "text-red" : "text-ink-2"}`}>{t("days", { n: b.balance })}</span>
        </li>
      ))}
    </ul>
  );
}
