import {
  Alert02Icon,
  ArrowLeft01Icon,
  Attachment01Icon,
  Calendar03Icon,
  CancelCircleIcon,
  CheckmarkCircle02Icon,
  CircleIcon,
  Clock01Icon,
  Comment01Icon,
  File01Icon,
  FileEditIcon,
  GitBranchIcon,
  MinusSignCircleIcon,
  UserQuestion01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { LocalTime } from "@/components/local-time";
import { AbsenceInsightView, type AbsenceInsightDto } from "@/components/requests/absence-insight";
import type { FieldDef } from "@/components/requests/field-input";
import { CancelRequestButton, CommentForm, ReassignControl, StepActions } from "@/components/requests/step-actions";
import { Avatar, Badge, Card, Empty, IconTile } from "@/components/ui";
import { formatDate, localized } from "@/lib/format";
import { getActor } from "@/server/auth/session";
import { NotFoundError } from "@/server/errors";
import { getRequest, requestAbsenceInsight } from "@/server/services/requests";
import { requestLookups } from "../lookups";

const STATUS_TONE = { draft: "neutral", in_progress: "warn", done: "ok", rejected: "red", cancelled: "neutral" } as const;
const STEP_TONE = { waiting: "neutral", active: "warn", needs_assignment: "red", done: "ok", rejected: "red", skipped: "neutral" } as const;
/** Timeline marker per step status. */
const STEP_MARK: Record<keyof typeof STEP_TONE, { icon: IconSvgElement; className: string }> = {
  done: { icon: CheckmarkCircle02Icon, className: "bg-ok-tint text-ok-strong" },
  active: { icon: Clock01Icon, className: "bg-warn-tint text-warn" },
  needs_assignment: { icon: UserQuestion01Icon, className: "bg-red-tint text-red" },
  rejected: { icon: CancelCircleIcon, className: "bg-red-tint text-red" },
  skipped: { icon: MinusSignCircleIcon, className: "bg-cream-deep text-ink-mute" },
  waiting: { icon: CircleIcon, className: "bg-cream-deep text-ink-mute" },
};

export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getActor();
  const r = await getRequest(actor, id).catch((err) => {
    if (err instanceof NotFoundError) notFound();
    throw err;
  });
  const locale = await getLocale();
  const [t, lookups, insight] = await Promise.all([getTranslations(), requestLookups(actor, locale), requestAbsenceInsight(actor, id)]);
  const groups = [...new Set(r.steps.map((s) => s.group))].sort((a, b) => a - b);
  const fieldDefs = r.fields as FieldDef[];
  const mySteps = r.steps.filter((s) => s.isMine);
  const finished = r.steps.filter((s) => ["done", "skipped"].includes(s.status)).length;
  const overdue = r.steps.some((s) => s.overdue);
  const groupState = (g: number) =>
    r.status === "in_progress" && g === r.currentGroup ? "current" : r.steps.filter((s) => s.group === g).every((s) => ["done", "skipped", "rejected"].includes(s.status)) ? "done" : "waiting";

  return (
    <>
      <Link href="/requests" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-ink-soft hover:text-ink">
        <HugeiconsIcon icon={ArrowLeft01Icon} size={16} />
        {t("requests2.back")}
      </Link>

      {/* ── header: what, whose, where it stands ── */}
      <section className="mb-6 rounded-card border border-edge bg-paper p-5 shadow-[0_1px_1px_rgba(28,39,76,0.04)] sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <IconTile icon={FileEditIcon} tone="navy" size={52} />
            <div className="min-w-0">
              <h1 className="text-2xl leading-tight font-medium tracking-[-0.02em] text-ink sm:text-3xl">{localized(locale, r.type.nameUk, r.type.nameEn)}</h1>
              <p className="mt-1 flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm text-ink-mute">{r.number}</span>
                <Badge tone={STATUS_TONE[r.status]}>{t(`requests.status.${r.status}`)}</Badge>
                {overdue && <Badge tone="red">{t("requests.overdue")}</Badge>}
              </p>
            </div>
          </div>
          {r.can.cancel && (
            <div>
              <CancelRequestButton requestId={r.id} />
            </div>
          )}
        </div>

        <dl className="mt-5 grid gap-4 border-t border-line pt-5 sm:grid-cols-2 lg:grid-cols-4">
          <Meta label={t("requests.initiator")}>
            <span className="flex items-center gap-2">
              <Avatar name={r.initiator.name} />
              {r.initiator.name}
            </span>
          </Meta>
          <Meta label={t("requests.subject")}>
            {r.subject ? (
              <Link href={`/employees/${r.subject.id}`} className="flex items-center gap-2 hover:text-red">
                <Avatar name={r.subject.name} />
                <span className="min-w-0">
                  <span className="block truncate">{r.subject.name}</span>
                  {r.subject.position && <span className="block truncate text-xs font-normal text-ink-mute">{r.subject.position}</span>}
                </span>
              </Link>
            ) : (
              t("common.none")
            )}
          </Meta>
          <Meta label={t("requests2.created")}>
            <LocalTime iso={r.createdAt} />
            {r.completedAt && (
              <span className="block text-xs font-normal text-ink-mute">
                {t("requests2.completed")}: <LocalTime iso={r.completedAt} />
              </span>
            )}
          </Meta>
          <Meta label={t("requests2.template")}>
            {t("requests2.templateVersion", { v: r.type.version })}
            {r.department && <span className="block text-xs font-normal text-ink-mute">{r.department.name}</span>}
            {r.parent && (
              <Link href={`/requests/${r.parent.id}`} className="block text-xs font-medium text-red hover:text-red-strong">
                {t("requests.parent")}: {r.parent.number}
              </Link>
            )}
          </Meta>
        </dl>

        <div className="mt-5">
          <div className="mb-1.5 flex justify-between text-xs text-ink-mute">
            <span>{t("requests2.progress", { done: finished, total: r.steps.length })}</span>
          </div>
          <div className="h-2 rounded-full bg-cream">
            <div
              className={`h-2 rounded-full ${r.status === "rejected" ? "bg-red" : r.status === "done" ? "bg-ok" : "bg-blue"}`}
              style={{ width: `${r.steps.length ? Math.max(3, (finished / r.steps.length) * 100) : 0}%` }}
            />
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="min-w-0 space-y-6">
          {/* ── the viewer's own step comes first, with its actions ── */}
          {mySteps.map((s) => (
            <section key={s.id} className="rounded-card border-2 border-red/40 bg-paper p-5 shadow-[0_1px_1px_rgba(28,39,76,0.04)]">
              <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <IconTile icon={Alert02Icon} size={36} />
                  <div className="min-w-0">
                    <p className="text-xs font-medium tracking-wide text-red uppercase">{t("requests2.yourStepTitle")}</p>
                    <h2 className="text-base font-bold text-ink-2">
                      {localized(locale, s.nameUk, s.nameEn)}
                      {s.system && <span className="font-normal text-ink-soft"> · {s.system.name}</span>}
                    </h2>
                  </div>
                </div>
                {s.dueAt && (
                  <span className={`inline-flex items-center gap-1.5 text-xs ${s.overdue ? "font-medium text-red-strong" : "text-ink-soft"}`}>
                    <HugeiconsIcon icon={Clock01Icon} size={14} />
                    {t("step.due")}: <LocalTime iso={s.dueAt} />
                  </span>
                )}
              </header>
              <p className="mb-3 text-sm text-ink-mute">
                {t(`step.type.${s.stepType}`)} · {t("requests2.yourStepHint")}
              </p>
              <StepActions step={s} fields={fieldDefs} lookups={lookups} />
            </section>
          ))}

          <Card icon={GitBranchIcon} tone="blue" title={t("requests2.timeline")} subtitle={t("requests2.progress", { done: finished, total: r.steps.length })}>
            <ol className="space-y-6">
              {groups.map((g) => {
                const state = groupState(g);
                return (
                  <li key={g}>
                    <p className="mb-3 flex items-center gap-2">
                      <span className={`text-xs font-bold tracking-wide uppercase ${state === "current" ? "text-ink" : "text-ink-mute"}`}>{t("requests.group", { n: g })}</span>
                      {state === "current" && <Badge tone="warn">{t("requests2.groupCurrent")}</Badge>}
                      {state === "done" && <Badge tone="ok">{t("requests2.groupDone")}</Badge>}
                      {state === "waiting" && <Badge>{t("requests2.groupWaiting")}</Badge>}
                    </p>
                    <ul>
                      {r.steps
                        .filter((s) => s.group === g)
                        .map((s, i, list) => {
                          const mark = STEP_MARK[s.status];
                          return (
                            <li key={s.id} className="relative flex gap-3 pb-4 last:pb-0">
                              {/* connector line between markers */}
                              {i < list.length - 1 && <span className="absolute top-9 bottom-0 left-[15px] w-0.5 bg-line" aria-hidden />}
                              <span className={`relative flex size-8 shrink-0 items-center justify-center rounded-full ${mark.className}`}>
                                <HugeiconsIcon icon={mark.icon} size={18} />
                              </span>
                              <div className={`min-w-0 flex-1 rounded-2xl border p-3.5 ${s.isMine ? "border-red/40 bg-red-tint/30" : "border-line"} ${["skipped", "rejected"].includes(s.status) ? "opacity-70" : ""}`}>
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                  <span className="min-w-0">
                                    <span className="block font-bold text-ink-2">
                                      {localized(locale, s.nameUk, s.nameEn)}
                                      {s.system && <span className="font-normal text-ink-soft"> · {s.system.name}</span>}
                                    </span>
                                    <span className="mt-0.5 block text-xs text-ink-mute">
                                      {t(`step.type.${s.stepType}`)} · {t("step.assignee")}: {s.assignee?.name ?? t("step.noAssignee")}
                                    </span>
                                    {s.dueAt && ["active", "needs_assignment"].includes(s.status) && (
                                      <span className={`mt-1 inline-flex items-center gap-1 text-xs ${s.overdue ? "font-medium text-red-strong" : "text-ink-soft"}`}>
                                        <HugeiconsIcon icon={Clock01Icon} size={13} />
                                        {t("step.due")}: <LocalTime iso={s.dueAt} />
                                      </span>
                                    )}
                                    {s.completedAt && s.status === "done" && (
                                      <span className="mt-1 block text-xs text-ink-mute">
                                        <LocalTime iso={s.completedAt} />
                                      </span>
                                    )}
                                  </span>
                                  <span className="flex flex-wrap gap-1">
                                    {s.isMine && <Badge tone="ink">{t("step.yourStep")}</Badge>}
                                    <Badge tone={STEP_TONE[s.status]}>{t(`step.status.${s.status}`)}</Badge>
                                  </span>
                                </div>
                                {s.comment && (
                                  <p className="mt-2.5 flex gap-2 rounded-xl bg-cream px-3 py-2 text-sm text-ink-2">
                                    <HugeiconsIcon icon={Comment01Icon} size={16} className="mt-0.5 shrink-0 text-ink-mute" />
                                    <span className="whitespace-pre-wrap">{s.comment}</span>
                                  </p>
                                )}
                                {s.childRequest && (
                                  <Link href={`/requests/${s.childRequest.id}`} className="mt-2.5 flex items-center gap-2 text-sm hover:text-red">
                                    <HugeiconsIcon icon={GitBranchIcon} size={16} className="text-ink-mute" />
                                    {t("requests.child")}: <span className="font-mono">{s.childRequest.number}</span>
                                    <Badge tone={STATUS_TONE[s.childRequest.status]}>{t(`requests.status.${s.childRequest.status}`)}</Badge>
                                  </Link>
                                )}
                                {s.attachments.map((a) => (
                                  <a key={a.id} href={a.url} className="mt-2 flex items-center gap-1.5 text-sm font-medium text-blue hover:underline">
                                    <HugeiconsIcon icon={Attachment01Icon} size={15} />
                                    {a.fileName}
                                  </a>
                                ))}
                                {r.can.reassign && ["active", "needs_assignment"].includes(s.status) && <ReassignControl stepId={s.id} people={lookups.people} />}
                              </div>
                            </li>
                          );
                        })}
                    </ul>
                  </li>
                );
              })}
            </ol>
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
          {insight && (
            <Card icon={Calendar03Icon} tone="warn" title={t("absenceInsight.title")}>
              <AbsenceInsightView insight={insight as AbsenceInsightDto} showWarnings={r.status === "in_progress"} />
            </Card>
          )}
          <Card icon={File01Icon} tone="neutral" title={t("requests.fields")}>
            {r.fields.length === 0 ? (
              <Empty icon={File01Icon}>{t("requests2.noFields")}</Empty>
            ) : (
              <dl className="-my-2 divide-y divide-line">
                {r.fields.map((f) => (
                  <div key={f.key} className="py-2.5">
                    <dt className="text-xs font-medium text-ink-mute">{localized(locale, f.labelUk, f.labelEn)}</dt>
                    <dd className="mt-0.5 text-sm font-medium text-ink-2">
                      <FieldValue type={f.type} display={f.display} options={f.options} locale={locale} none={t("common.none")} />
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </Card>
          <Card icon={Comment01Icon} tone="blue" title={t("requests.comments")} subtitle={r.comments.length ? String(r.comments.length) : undefined}>
            {r.comments.length === 0 ? (
              <Empty icon={Comment01Icon}>{t("requests2.noComments")}</Empty>
            ) : (
              <ul className="space-y-4">
                {r.comments.map((c) => (
                  <li key={c.id} className="flex gap-3">
                    <Avatar name={c.author} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">
                        <span className="font-bold text-ink-2">{c.author}</span>{" "}
                        <span className="text-xs text-ink-mute">
                          <LocalTime iso={c.createdAt} />
                        </span>
                      </p>
                      <p className="mt-1 rounded-2xl rounded-tl-sm bg-cream px-3 py-2 text-sm whitespace-pre-wrap text-ink-2">{c.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {r.can.comment && (
              <div className="mt-4 border-t border-line pt-4">
                <CommentForm requestId={r.id} />
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

/** One fact in the request header: small label over the value. */
function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="mb-1 text-xs font-medium text-ink-mute">{label}</dt>
      <dd className="text-sm font-medium text-ink-2">{children}</dd>
    </div>
  );
}

function FieldValue({ type, display, options, locale, none }: { type: string; display: unknown; options: unknown; locale: string; none: string }) {
  if (display == null || display === "") return <span className="font-normal text-ink-mute">{none}</span>;
  if (type === "date") return <>{formatDate(String(display), locale)}</>;
  if (type === "date_range") {
    const v = display as { from: string; to: string };
    return (
      <>
        {formatDate(v.from, locale)} — {formatDate(v.to, locale)}
      </>
    );
  }
  if (type === "systems") {
    return (
      <ul className="mt-1 flex flex-wrap gap-1.5">
        {(display as { system: string; level: string }[]).map((s) => (
          <li key={s.system}>
            <Badge>
              {s.system}
              {s.level && <span className="ml-1 text-ink-mute">· {s.level}</span>}
            </Badge>
          </li>
        ))}
      </ul>
    );
  }
  if (type === "file") {
    const f = display as { fileName: string; url: string };
    return (
      <a className="inline-flex items-center gap-1.5 text-blue hover:underline" href={f.url}>
        <HugeiconsIcon icon={Attachment01Icon} size={15} />
        {f.fileName}
      </a>
    );
  }
  const optionList = Array.isArray(options) ? (options as { value: string; labelUk: string; labelEn?: string | null }[]) : null;
  const label = (v: string) => {
    const o = optionList?.find((x) => x.value === v);
    return o ? localized(locale, o.labelUk, o.labelEn) : v;
  };
  if (type === "multiselect" && Array.isArray(display)) {
    return (
      <span className="mt-1 flex flex-wrap gap-1.5">
        {(display as string[]).map((v) => (
          <Badge key={v}>{label(v)}</Badge>
        ))}
      </span>
    );
  }
  if (type === "select") return <>{label(String(display))}</>;
  return <span className="whitespace-pre-wrap">{String(display)}</span>;
}
