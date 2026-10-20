import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { LocalTime } from "@/components/local-time";
import { Badge, PageTitle } from "@/components/ui";
import { getActor } from "@/server/auth/session";
import { hasPermission } from "@/server/authz/policy";
import { listAuditLog } from "@/server/services/audit-log";

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ before?: string }> }) {
  const actor = await getActor();
  if (!hasPermission(actor, "audit.view")) notFound();
  const { before } = await searchParams;
  const [rows, t] = await Promise.all([listAuditLog(actor, { limit: 100, before }), getTranslations()]);

  return (
    <>
      <PageTitle>{t("audit.title")}</PageTitle>
      <div className="overflow-x-auto rounded-xl border border-line bg-paper">
        <table className="table">
          <thead>
            <tr>
              <th>{t("audit.at")}</th>
              <th>{t("audit.actor")}</th>
              <th>{t("audit.action")}</th>
              <th>{t("audit.entity")}</th>
              <th>{t("audit.details")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-ink-mute">{t("common.noResults")}</td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap text-xs"><LocalTime iso={r.at} /></td>
                <td className="font-mono text-xs">{r.actor?.email ?? t("audit.system")}</td>
                <td><Badge>{r.action}</Badge></td>
                <td className="font-mono text-xs">{r.entity}<span className="block text-ink-mute">{r.entityId.slice(0, 8)}</span></td>
                <td className="max-w-xl text-xs">
                  {r.redacted ? (
                    <span className="text-ink-mute">{t("audit.redacted")}</span>
                  ) : (
                    <details>
                      <summary className="cursor-pointer text-ink-soft">{t("audit.details")}</summary>
                      <div className="mt-2 grid gap-2 md:grid-cols-2">
                        {r.before != null && (
                          <pre className="overflow-auto rounded bg-cream p-2 text-[11px]"><b>{t("audit.before")}</b>{"\n"}{JSON.stringify(r.before, null, 1)}</pre>
                        )}
                        {r.after != null && (
                          <pre className="overflow-auto rounded bg-cream p-2 text-[11px]"><b>{t("audit.after")}</b>{"\n"}{JSON.stringify(r.after, null, 1)}</pre>
                        )}
                      </div>
                    </details>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 100 && (
        <a className="mt-4 inline-block text-sm underline" href={`/audit?before=${encodeURIComponent(rows[rows.length - 1].at)}`}>→</a>
      )}
    </>
  );
}
