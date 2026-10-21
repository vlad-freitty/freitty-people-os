import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { LocalTime } from "@/components/local-time";
import { Badge, LinkButton, PageTitle } from "@/components/ui";
import { localized } from "@/lib/format";
import { getActor } from "@/server/auth/session";
import { listRequests } from "@/server/services/requests";

const STATUS_TONE = { draft: "neutral", in_progress: "warn", done: "ok", rejected: "red", cancelled: "neutral" } as const;
const FILTERS = [
  ["all", "filterAll"],
  ["initiated", "filterInitiated"],
  ["about_me", "filterAboutMe"],
] as const;

export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ mine?: string; status?: string }> }) {
  const actor = await getActor();
  const sp = await searchParams;
  const mine = FILTERS.some(([k]) => k === sp.mine) ? sp.mine : "all";
  const [rows, t, locale] = await Promise.all([listRequests(actor, { mine, status: sp.status || undefined }), getTranslations(), getLocale()]);

  return (
    <>
      <PageTitle actions={actor.employeeId && <LinkButton href="/requests/new">{t("requests.new")}</LinkButton>}>{t("requests.title")}</PageTitle>
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        {FILTERS.map(([key, label]) => (
          <Link
            key={key}
            href={key === "all" ? "/requests" : `/requests?mine=${key}`}
            className={`rounded-full px-3 py-1.5 ${mine === key ? "bg-navy text-white" : "bg-paper text-ink-soft hover:text-ink"}`}
          >
            {t(`requests.${label}`)}
          </Link>
        ))}
      </div>
      <div className="overflow-x-auto rounded-card border border-edge bg-paper">
        <table className="table">
          <thead>
            <tr>
              <th>{t("requests.number")}</th>
              <th>{t("requests.type")}</th>
              <th>{t("requests.subject")}</th>
              <th className="hidden md:table-cell">{t("requests.initiator")}</th>
              <th className="hidden md:table-cell">{t("requests.createdAt")}</th>
              <th>{t("employee.status")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-ink-mute">{t("requests.empty")}</td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-cream/60">
                <td className="font-mono text-xs">
                  <Link href={`/requests/${r.id}`} className="hover:text-red">{r.number}</Link>
                </td>
                <td>
                  <Link href={`/requests/${r.id}`} className="font-medium hover:text-red">{localized(locale, r.type.nameUk, r.type.nameEn)}</Link>
                  {r.isChild && <span className="block text-xs text-ink-mute">{t("requests.child")}</span>}
                </td>
                <td>{r.subject?.name ?? t("common.none")}</td>
                <td className="hidden md:table-cell">{r.initiator}</td>
                <td className="hidden whitespace-nowrap text-xs md:table-cell"><LocalTime iso={r.createdAt} /></td>
                <td className="space-x-1">
                  <Badge tone={STATUS_TONE[r.status]}>{t(`requests.status.${r.status}`)}</Badge>
                  {r.overdue && <Badge tone="red">{t("requests.overdue")}</Badge>}
                  {r.needsAssignment && <Badge tone="warn">{t("requests.needsAssignment")}</Badge>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
