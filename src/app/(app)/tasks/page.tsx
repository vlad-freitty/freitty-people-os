import { CheckListIcon, Clock01Icon, File01Icon, GitBranchIcon, PencilEdit02Icon, TaskDone01Icon, ThumbsUpIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { getLocale, getTranslations } from "next-intl/server";
import { sectionIcons } from "@/components/icons";
import { LocalTime } from "@/components/local-time";
import { Badge, Card, EmptyState, IconTile, List, ListRow, PageTitle, Stat, type TileTone } from "@/components/ui";
import { localized } from "@/lib/format";
import { getActor } from "@/server/auth/session";
import { listMyTasks } from "@/server/services/requests";

/** Icon per step type: what kind of action the task needs. */
const STEP_LOOK: Record<string, { icon: IconSvgElement; tone: TileTone }> = {
  approve: { icon: ThumbsUpIcon, tone: "blue" },
  task: { icon: CheckListIcon, tone: "ok" },
  fill: { icon: PencilEdit02Icon, tone: "warn" },
  document: { icon: File01Icon, tone: "neutral" },
  child_request: { icon: GitBranchIcon, tone: "blue" },
};

export default async function TasksPage() {
  const actor = await getActor();
  const [tasks, t, locale] = await Promise.all([listMyTasks(actor), getTranslations(), getLocale()]);
  const overdue = tasks.filter((x) => x.overdue).length;
  const approvals = tasks.filter((x) => x.stepType === "approve").length;
  return (
    <>
      <PageTitle icon={sectionIcons.tasks} subtitle={t("requests2.tasksSubtitle")}>
        {t("tasks.title")}
      </PageTitle>

      <div className="mb-6 grid grid-cols-3 gap-3">
        <Stat label={t("requests2.tasksTotal")} value={tasks.length} />
        <Stat label={t("requests2.tasksOverdue")} value={overdue} tone="red" />
        <Stat label={t("requests2.tasksApprovals")} value={approvals} tone="warn" />
      </div>

      <Card icon={TaskDone01Icon} tone="ok" title={t("requests2.tasksList")}>
        {tasks.length === 0 ? (
          <EmptyState icon={TaskDone01Icon} title={t("tasks.empty")} hint={t("requests2.tasksEmptyHint")} />
        ) : (
          <List>
            {tasks.map((task) => {
              const look = STEP_LOOK[task.stepType] ?? STEP_LOOK.task!;
              return (
                <ListRow
                  key={task.stepId}
                  href={`/requests/${task.requestId}`}
                  leading={<IconTile icon={look.icon} tone={task.overdue ? "red" : look.tone} size={36} />}
                  title={
                    <>
                      {localized(locale, task.nameUk, task.nameEn)}
                      {task.system && <span className="font-normal text-ink-soft"> · {task.system}</span>}
                    </>
                  }
                  subtitle={[task.number, localized(locale, task.requestType.nameUk, task.requestType.nameEn), task.subject].filter(Boolean).join(" · ")}
                  trailing={
                    <span className="flex flex-col items-end gap-1">
                      <span className="hidden sm:inline">
                        <Badge>{t(`step.type.${task.stepType}`)}</Badge>
                      </span>
                      {task.dueAt && (
                        <span className={`inline-flex items-center gap-1 text-xs whitespace-nowrap ${task.overdue ? "font-medium text-red-strong" : "text-ink-soft"}`}>
                          <HugeiconsIcon icon={Clock01Icon} size={13} />
                          <LocalTime iso={task.dueAt} />
                        </span>
                      )}
                      {task.overdue && <Badge tone="red">{t("tasks.overdue")}</Badge>}
                    </span>
                  }
                />
              );
            })}
          </List>
        )}
      </Card>
    </>
  );
}
