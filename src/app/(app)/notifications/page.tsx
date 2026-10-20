import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { LocalTime } from "@/components/local-time";
import { MarkAllRead } from "@/components/notification-settings";
import { Badge, PageTitle } from "@/components/ui";
import { localized } from "@/lib/format";
import { getActor } from "@/server/auth/session";
import { listNotifications } from "@/server/services/notifications";

const TONE = { step_assigned: "warn", step_overdue: "red", request_done: "ok", request_rejected: "red" } as const;

export default async function NotificationsPage() {
  const actor = await getActor();
  const [items, t, locale] = await Promise.all([listNotifications(actor), getTranslations("notifications"), getLocale()]);
  const unread = items.some((n) => !n.readAt);
  return (
    <>
      <PageTitle actions={unread && <MarkAllRead />}>{t("title")}</PageTitle>
      {items.length === 0 ? (
        <p className="text-sm text-ink-mute">{t("empty")}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((n) => (
            <li key={n.id}>
              <Link
                href={`/requests/${n.payload.requestId}`}
                className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 transition hover:border-ink ${n.readAt ? "border-line bg-paper/60" : "border-ink/30 bg-paper"}`}
              >
                <span className="min-w-0">
                  <Badge tone={TONE[n.type]}>{t(`types.${n.type}`)}</Badge>{" "}
                  <span className={n.readAt ? "" : "font-medium"}>
                    {n.payload.stepUk ? localized(locale, n.payload.stepUk, n.payload.stepEn) : localized(locale, n.payload.typeUk, n.payload.typeEn)}
                  </span>
                  <span className="block truncate text-xs text-ink-mute">
                    {n.payload.number} · {localized(locale, n.payload.typeUk, n.payload.typeEn)}
                    {n.payload.comment && <> · {n.payload.comment}</>}
                  </span>
                </span>
                <span className="text-xs text-ink-soft">
                  <LocalTime iso={n.createdAt} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
