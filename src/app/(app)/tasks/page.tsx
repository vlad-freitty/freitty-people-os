import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { LocalTime } from "@/components/local-time";
import { Badge, PageTitle } from "@/components/ui";
import { localized } from "@/lib/format";
import { getActor } from "@/server/auth/session";
import { listMyTasks } from "@/server/services/requests";

export default async function TasksPage() {
  const actor = await getActor();
  const [tasks, t, locale] = await Promise.all([listMyTasks(actor), getTranslations(), getLocale()]);
  return (
    <>
      <PageTitle>{t("tasks.title")}</PageTitle>
      {tasks.length === 0 ? (
        <p className="text-sm text-ink-mute">{t("tasks.empty")}</p>
      ) : (
        <ul className="space-y-3">
          {tasks.map((task) => (
            <li key={task.stepId}>
              <Link
                href={`/requests/${task.requestId}`}
                className={`flex flex-wrap items-center justify-between gap-3 rounded-card border bg-paper p-4 transition hover:border-ink ${task.overdue ? "border-red/50" : "border-line"}`}
              >
                <span>
                  <span className="font-medium">{localized(locale, task.nameUk, task.nameEn)}</span>
                  {task.system && <span className="text-ink-soft"> · {task.system}</span>}
                  <span className="block text-xs text-ink-mute">
                    {task.number} · {localized(locale, task.requestType.nameUk, task.requestType.nameEn)}
                    {task.subject && <> · {task.subject}</>}
                  </span>
                </span>
                <span className="flex items-center gap-2 text-xs">
                  <Badge tone="ink">{t(`step.type.${task.stepType}`)}</Badge>
                  {task.dueAt && (
                    <span className={task.overdue ? "font-medium text-red-strong" : "text-ink-soft"}>
                      {t("tasks.due")}: <LocalTime iso={task.dueAt} />
                      {task.overdue && <> · {t("tasks.overdue")}</>}
                    </span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
