import { FileEditIcon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { sectionIcons } from "@/components/icons";
import { LocalTime } from "@/components/local-time";
import { Avatar, Badge, Card, EmptyState, IconTile, LinkButton, List, ListRow, PageTitle } from "@/components/ui";
import { localized } from "@/lib/format";
import { getActor } from "@/server/auth/session";
import { listRequests } from "@/server/services/requests";

const STATUS_TONE = { draft: "neutral", in_progress: "warn", done: "ok", rejected: "red", cancelled: "neutral" } as const;
const FILTERS = [
  ["all", "filterAll"],
  ["initiated", "filterInitiated"],
  ["about_me", "filterAboutMe"],
] as const;
const STATUSES = ["in_progress", "done", "rejected", "cancelled"] as const;

/** Pill toggle used for both filter rows. */
function Pill({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={`inline-flex h-9 items-center rounded-full border px-3.5 text-sm font-medium whitespace-nowrap transition ${
        active ? "border-navy bg-navy text-white" : "border-line-strong bg-paper text-ink-soft hover:text-ink"
      }`}
    >
      {children}
    </Link>
  );
}

export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ mine?: string; status?: string }> }) {
  const actor = await getActor();
  const sp = await searchParams;
  const mine = FILTERS.some(([k]) => k === sp.mine) ? sp.mine! : "all";
  const status = STATUSES.find((s) => s === sp.status);
  const [rows, t, locale] = await Promise.all([listRequests(actor, { mine, status }), getTranslations(), getLocale()]);
  const href = (m: string, s?: string) => {
    const q = new URLSearchParams();
    if (m !== "all") q.set("mine", m);
    if (s) q.set("status", s);
    const qs = q.toString();
    return qs ? `/requests?${qs}` : "/requests";
  };
  const newButton = actor.employeeId && (
    <LinkButton href="/requests/new">
      <HugeiconsIcon icon={PlusSignIcon} size={18} />
      {t("requests.new")}
    </LinkButton>
  );

  return (
    <>
      <PageTitle icon={sectionIcons.requests} subtitle={t("requests2.listSubtitle")} actions={newButton}>
        {t("requests.title")}
      </PageTitle>

      <div className="mb-5 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-medium tracking-wide text-ink-mute uppercase">{t("requests2.whose")}</span>
          {FILTERS.map(([key, label]) => (
            <Pill key={key} href={href(key, status)} active={mine === key}>
              {t(`requests.${label}`)}
            </Pill>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-medium tracking-wide text-ink-mute uppercase">{t("requests2.statusLabel")}</span>
          <Pill href={href(mine)} active={!status}>
            {t("requests2.statusAll")}
          </Pill>
          {STATUSES.map((s) => (
            <Pill key={s} href={href(mine, s)} active={status === s}>
              {t(`requests.status.${s}`)}
            </Pill>
          ))}
        </div>
      </div>

      <Card
        icon={FileEditIcon}
        tone="blue"
        title={
          <span className="flex items-center gap-2">
            {t("requests2.listTitle")} <Badge>{rows.length}</Badge>
          </span>
        }
      >
        {rows.length === 0 ? (
          <EmptyState icon={FileEditIcon} title={t("requests.empty")} hint={t("requests2.emptyHint")} action={newButton} />
        ) : (
          <>
            {/* phone: rows */}
            <div className="md:hidden">
              <List>
                {rows.map((r) => (
                  <ListRow
                    key={r.id}
                    href={`/requests/${r.id}`}
                    leading={<IconTile icon={FileEditIcon} tone={r.overdue ? "red" : "blue"} size={32} />}
                    title={localized(locale, r.type.nameUk, r.type.nameEn)}
                    subtitle={`${r.number} · ${r.subject?.name ?? r.initiator}`}
                    trailing={<Badge tone={STATUS_TONE[r.status]}>{t(`requests.status.${r.status}`)}</Badge>}
                  />
                ))}
              </List>
            </div>
            {/* desktop: table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t("requests.type")}</th>
                    <th>{t("requests.subject")}</th>
                    <th>{t("requests.initiator")}</th>
                    <th>{t("requests.createdAt")}</th>
                    <th>{t("employee.status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-cream/60">
                      <td>
                        <Link href={`/requests/${r.id}`} className="flex items-center gap-3 hover:text-red">
                          <IconTile icon={FileEditIcon} tone={r.overdue ? "red" : "blue"} size={32} />
                          <span className="min-w-0">
                            <span className="block font-bold text-ink-2">{localized(locale, r.type.nameUk, r.type.nameEn)}</span>
                            <span className="block font-mono text-xs text-ink-mute">
                              {r.number}
                              {r.isChild && <span className="font-sans"> · {t("requests.child")}</span>}
                            </span>
                          </span>
                        </Link>
                      </td>
                      <td>
                        {r.subject ? (
                          <span className="flex items-center gap-2">
                            <Avatar name={r.subject.name ?? ""} />
                            <span className="text-ink-2">{r.subject.name}</span>
                          </span>
                        ) : (
                          <span className="text-ink-mute">{t("common.none")}</span>
                        )}
                      </td>
                      <td className="text-ink-soft">{r.initiator}</td>
                      <td className="text-xs whitespace-nowrap text-ink-soft">
                        <LocalTime iso={r.createdAt} />
                      </td>
                      <td>
                        <span className="flex flex-wrap gap-1">
                          <Badge tone={STATUS_TONE[r.status]}>{t(`requests.status.${r.status}`)}</Badge>
                          {r.overdue && <Badge tone="red">{t("requests.overdue")}</Badge>}
                          {r.needsAssignment && <Badge tone="warn">{t("requests.needsAssignment")}</Badge>}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </>
  );
}
