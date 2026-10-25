import { Add01Icon, ArrowRight01Icon, Delete02Icon, Key01Icon, PencilEdit02Icon, Robot01Icon, Activity01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { sectionIcons } from "@/components/icons";
import { LocalTime } from "@/components/local-time";
import { Avatar, Badge, Card, EmptyState, IconTile, PageTitle, type TileTone } from "@/components/ui";
import { getActor } from "@/server/auth/session";
import { hasPermission } from "@/server/authz/policy";
import { listAuditLog } from "@/server/services/audit-log";

// the entities people look for most often; "all" shows everything
const ENTITY_FILTERS = ["Employee", "User", "Request", "Absence", "Shift", "PaymentPeriod", "Role", "Department", "Company"] as const;

/** What kind of change: the verb at the end of the action code decides the icon and colour. */
function actionLook(action: string): { icon: IconSvgElement; tone: TileTone } {
  const verb = action.split(".").at(-1) ?? "";
  if (action.includes("password")) return { icon: Key01Icon, tone: "warn" };
  if (verb === "create" || verb === "import" || verb.startsWith("import")) return { icon: Add01Icon, tone: "ok" };
  if (verb === "delete" || verb === "cancel" || verb === "unlink") return { icon: Delete02Icon, tone: "red" };
  if (verb === "update" || verb === "save" || verb === "set" || verb === "assign" || verb === "adjust") return { icon: PencilEdit02Icon, tone: "blue" };
  return { icon: Activity01Icon, tone: "neutral" };
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ before?: string; entity?: string }> }) {
  const actor = await getActor();
  if (!hasPermission(actor, "audit.view")) notFound();
  const { before, entity } = await searchParams;
  const [rows, t] = await Promise.all([listAuditLog(actor, { limit: 100, before, entity: entity || undefined }), getTranslations()]);
  const href = (params: { entity?: string; before?: string }) => {
    const q = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => !!e[1]));
    return q.size ? `/audit?${q}` : "/audit";
  };

  return (
    <>
      <PageTitle icon={sectionIcons.audit} subtitle={t("admin2.auditSubtitle")}>
        {t("audit.title")}
      </PageTitle>

      <nav className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1" aria-label={t("admin2.filterByObject")}>
        {[undefined, ...ENTITY_FILTERS].map((e) => {
          const on = (entity || undefined) === e;
          return (
            <Link
              key={e ?? "all"}
              href={href({ entity: e })}
              aria-current={on ? "page" : undefined}
              className={`rounded-full border px-4 py-2 text-sm font-medium whitespace-nowrap transition ${on ? "border-navy bg-navy text-white" : "border-line-strong bg-paper text-ink-soft hover:bg-cream"}`}
            >
              {e ? t(`admin2.entities.${e}`) : t("common.all")}
            </Link>
          );
        })}
      </nav>

      <Card icon={Activity01Icon} tone="neutral" title={t("admin2.auditEntries")} subtitle={t("admin2.auditShown", { n: rows.length })}>
        {rows.length === 0 ? (
          <EmptyState icon={Search01Icon} title={t("common.noResults")} hint={t("admin2.auditEmptyHint")} />
        ) : (
          <ul className="-my-2 divide-y divide-line">
            {rows.map((r) => {
              const look = actionLook(r.action);
              return (
                <li key={r.id} className="py-3">
                  <div className="flex items-start gap-3">
                    {r.actor?.email ? <Avatar name={r.actor.email.split("@")[0]!.replace(/[._-]+/g, " ")} /> : <IconTile icon={Robot01Icon} tone="neutral" size={36} />}
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="inline-flex items-center gap-1.5">
                          <IconTile icon={look.icon} tone={look.tone} size={22} />
                          <span className="font-mono text-xs font-medium text-ink-2">{r.action}</span>
                        </span>
                        <Badge>
                          {r.entity}
                          <span className="ml-1 font-mono text-ink-mute">{r.entityId.slice(0, 8)}</span>
                        </Badge>
                      </p>
                      <p className="mt-0.5 truncate text-xs text-ink-mute">{r.actor?.email ?? t("audit.system")}</p>
                      {r.redacted ? (
                        <p className="mt-1 text-xs text-ink-mute">{t("audit.redacted")}</p>
                      ) : (
                        (r.before != null || r.after != null) && (
                          <details className="group mt-1.5">
                            <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-ink-soft hover:text-ink">
                              <HugeiconsIcon icon={ArrowRight01Icon} size={14} className="transition group-open:rotate-90" />
                              {t("audit.details")}
                            </summary>
                            <div className="mt-2 grid gap-2 md:grid-cols-2">
                              {r.before != null && (
                                <div className="min-w-0 rounded-xl bg-red-tint/50 p-2">
                                  <p className="mb-1 text-[11px] font-bold text-red">{t("audit.before")}</p>
                                  <pre className="overflow-auto text-[11px] text-ink-2">{JSON.stringify(r.before, null, 1)}</pre>
                                </div>
                              )}
                              {r.after != null && (
                                <div className="min-w-0 rounded-xl bg-ok-tint p-2">
                                  <p className="mb-1 text-[11px] font-bold text-ok-strong">{t("audit.after")}</p>
                                  <pre className="overflow-auto text-[11px] text-ink-2">{JSON.stringify(r.after, null, 1)}</pre>
                                </div>
                              )}
                            </div>
                          </details>
                        )
                      )}
                    </div>
                    <span className="shrink-0 text-right text-xs whitespace-nowrap text-ink-soft">
                      <LocalTime iso={r.at} />
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {rows.length === 100 && (
        <div className="mt-4 flex justify-center">
          <Link
            className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line-strong bg-paper px-4 py-2 text-sm font-medium text-ink hover:bg-cream"
            href={href({ entity, before: rows[rows.length - 1]!.at })}
          >
            {t("admin2.older")}
            <HugeiconsIcon icon={ArrowRight01Icon} size={16} />
          </Link>
        </div>
      )}
    </>
  );
}
