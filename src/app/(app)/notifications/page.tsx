import { Alert02Icon, CancelCircleIcon, CheckmarkCircle02Icon, MailOpen01Icon, Notification02Icon, NotificationOff01Icon, TaskDone01Icon } from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { getLocale, getTranslations } from "next-intl/server";
import { sectionIcons } from "@/components/icons";
import { LocalTime } from "@/components/local-time";
import { MarkAllRead } from "@/components/notification-settings";
import { Badge, Card, EmptyState, IconTile, List, ListRow, PageTitle, type TileTone } from "@/components/ui";
import { localized } from "@/lib/format";
import { getActor } from "@/server/auth/session";
import { listNotifications } from "@/server/services/notifications";

const LOOK: Record<string, { icon: IconSvgElement; tone: TileTone; badge: "warn" | "red" | "ok" }> = {
  step_assigned: { icon: TaskDone01Icon, tone: "warn", badge: "warn" },
  step_overdue: { icon: Alert02Icon, tone: "red", badge: "red" },
  request_done: { icon: CheckmarkCircle02Icon, tone: "ok", badge: "ok" },
  request_rejected: { icon: CancelCircleIcon, tone: "red", badge: "red" },
};

export default async function NotificationsPage() {
  const actor = await getActor();
  const [items, t, locale] = await Promise.all([listNotifications(actor), getTranslations(), getLocale()]);
  const fresh = items.filter((n) => !n.readAt);
  const earlier = items.filter((n) => n.readAt);

  const rows = (list: typeof items) => (
    <List>
      {list.map((n) => {
        const look = LOOK[n.type] ?? { icon: Notification02Icon, tone: "neutral" as const, badge: "warn" as const };
        return (
          <ListRow
            key={n.id}
            href={`/requests/${n.payload.requestId}`}
            leading={
              <span className="relative">
                <IconTile icon={look.icon} tone={n.readAt ? "neutral" : look.tone} size={36} />
                {!n.readAt && <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full border-2 border-paper bg-red" aria-hidden />}
              </span>
            }
            title={
              <span className={n.readAt ? "font-normal text-ink-soft" : ""}>
                {n.payload.stepUk ? localized(locale, n.payload.stepUk, n.payload.stepEn) : localized(locale, n.payload.typeUk, n.payload.typeEn)}
              </span>
            }
            subtitle={
              <>
                {n.payload.number} · {localized(locale, n.payload.typeUk, n.payload.typeEn)}
                {n.payload.comment && <> · {n.payload.comment}</>}
              </>
            }
            trailing={
              <span className="flex flex-col items-end gap-1">
                <span className="hidden sm:inline">
                  <Badge tone={look.badge}>{t(`notifications.types.${n.type}`)}</Badge>
                </span>
                <span className="text-xs whitespace-nowrap text-ink-mute">
                  <LocalTime iso={n.createdAt} />
                </span>
              </span>
            }
          />
        );
      })}
    </List>
  );

  return (
    <>
      <PageTitle icon={sectionIcons.notifications} subtitle={t("requests2.notifSubtitle")} actions={fresh.length > 0 && <MarkAllRead />}>
        {t("notifications.title")}
      </PageTitle>
      {items.length === 0 ? (
        <EmptyState icon={NotificationOff01Icon} title={t("notifications.empty")} hint={t("requests2.notifEmptyHint")} />
      ) : (
        <div className="space-y-6">
          {fresh.length > 0 && (
            <Card
              icon={Notification02Icon}
              tone="red"
              title={
                <span className="flex items-center gap-2">
                  {t("requests2.notifNew")} <Badge tone="red">{fresh.length}</Badge>
                </span>
              }
            >
              {rows(fresh)}
            </Card>
          )}
          {earlier.length > 0 && (
            <Card icon={MailOpen01Icon} tone="neutral" title={t("requests2.notifEarlier")}>
              {rows(earlier)}
            </Card>
          )}
        </div>
      )}
    </>
  );
}
