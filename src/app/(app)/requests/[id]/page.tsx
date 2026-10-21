import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { LocalTime } from "@/components/local-time";
import { CancelRequestButton, CommentForm, ReassignControl, StepActions } from "@/components/requests/step-actions";
import type { FieldDef } from "@/components/requests/field-input";
import { Badge, Card, PageTitle } from "@/components/ui";
import { formatDate, localized } from "@/lib/format";
import { getActor } from "@/server/auth/session";
import { NotFoundError } from "@/server/errors";
import { getRequest, requestAbsenceInsight } from "@/server/services/requests";
import { AbsenceInsightView, type AbsenceInsightDto } from "@/components/requests/absence-insight";
import { requestLookups } from "../lookups";

const STATUS_TONE = { draft: "neutral", in_progress: "warn", done: "ok", rejected: "red", cancelled: "neutral" } as const;
const STEP_TONE = { waiting: "neutral", active: "warn", needs_assignment: "red", done: "ok", rejected: "red", skipped: "neutral" } as const;

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

  return (
    <>
      <PageTitle actions={r.can.cancel && <CancelRequestButton requestId={r.id} />}>
        <span className="font-mono text-base text-ink-mute">{r.number}</span> {localized(locale, r.type.nameUk, r.type.nameEn)}{" "}
        <span className="align-middle">
          <Badge tone={STATUS_TONE[r.status]}>{t(`requests.status.${r.status}`)}</Badge>
        </span>
      </PageTitle>
      <p className="-mt-4 mb-6 text-sm text-ink-soft">
        {t("requests.initiator")}: {r.initiator.name}
        {r.subject && (
          <>
            {" · "}
            {t("requests.subject")}: <Link className="underline" href={`/employees/${r.subject.id}`}>{r.subject.name}</Link>
          </>
        )}
        {" · "}
        {t("requests.version", { v: r.type.version })}
        {r.parent && (
          <>
            {" · "}
            {t("requests.parent")}: <Link className="underline" href={`/requests/${r.parent.id}`}>{r.parent.number}</Link>
          </>
        )}
      </p>

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Card title={t("requests.steps")}>
          <ol className="space-y-5">
            {groups.map((g) => (
              <li key={g}>
                <p className={`label ${g === r.currentGroup && r.status === "in_progress" ? "text-ink" : ""}`}>{t("requests.group", { n: g })}</p>
                <ul className="space-y-2">
                  {r.steps
                    .filter((s) => s.group === g)
                    .map((s) => (
                      <li key={s.id} className={`rounded-xl border p-3 ${s.isMine ? "border-ink" : "border-line"} ${["skipped", "rejected"].includes(s.status) ? "opacity-70" : ""}`}>
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <span>
                            <span className="font-medium">{localized(locale, s.nameUk, s.nameEn)}</span>
                            {s.system && <span className="text-ink-soft"> · {s.system.name}</span>}
                            <span className="block text-xs text-ink-mute">
                              {t(`step.type.${s.stepType}`)} · {t("step.assignee")}: {s.assignee?.name ?? t("step.noAssignee")}
                              {s.dueAt && ["active", "needs_assignment"].includes(s.status) && (
                                <>
                                  {" · "}
                                  <span className={s.overdue ? "font-medium text-red-strong" : ""}>
                                    {t("step.due")}: <LocalTime iso={s.dueAt} />
                                  </span>
                                </>
                              )}
                            </span>
                          </span>
                          <span className="flex gap-1">
                            {s.isMine && <Badge tone="ink">{t("step.yourStep")}</Badge>}
                            <Badge tone={STEP_TONE[s.status]}>{t(`step.status.${s.status}`)}</Badge>
                          </span>
                        </div>
                        {s.comment && <p className="mt-2 rounded bg-cream px-2 py-1 text-sm">{s.comment}</p>}
                        {s.childRequest && (
                          <p className="mt-2 text-sm">
                            {t("requests.child")}: <Link className="underline" href={`/requests/${s.childRequest.id}`}>{s.childRequest.number}</Link>{" "}
                            <Badge tone={STATUS_TONE[s.childRequest.status]}>{t(`requests.status.${s.childRequest.status}`)}</Badge>
                          </p>
                        )}
                        {s.attachments.map((a) => (
                          <a key={a.id} href={a.url} className="mt-2 block text-sm underline">
                            📎 {a.fileName}
                          </a>
                        ))}
                        {s.isMine && <StepActions step={s} fields={fieldDefs} lookups={lookups} />}
                        {r.can.reassign && ["active", "needs_assignment"].includes(s.status) && <ReassignControl stepId={s.id} people={lookups.people} />}
                      </li>
                    ))}
                </ul>
              </li>
            ))}
          </ol>
        </Card>

        <div className="space-y-6">
          {insight && (
            <Card title={t("absenceInsight.title")}>
              <AbsenceInsightView insight={insight as AbsenceInsightDto} showWarnings={r.status === "in_progress"} />
            </Card>
          )}
          <Card title={t("requests.fields")}>
            <dl className="space-y-3">
              {r.fields.map((f) => (
                <div key={f.key}>
                  <dt className="label">{localized(locale, f.labelUk, f.labelEn)}</dt>
                  <dd className="text-sm">
                    <FieldValue type={f.type} display={f.display} options={f.options} locale={locale} none={t("common.none")} />
                  </dd>
                </div>
              ))}
            </dl>
          </Card>
          <Card title={t("requests.comments")}>
            <ul className="mb-4 space-y-3">
              {r.comments.map((c) => (
                <li key={c.id} className="text-sm">
                  <span className="font-medium">{c.author}</span>{" "}
                  <span className="text-xs text-ink-mute">
                    <LocalTime iso={c.createdAt} />
                  </span>
                  <p className="whitespace-pre-wrap">{c.body}</p>
                </li>
              ))}
            </ul>
            {r.can.comment && <CommentForm requestId={r.id} />}
          </Card>
        </div>
      </div>
    </>
  );
}

function FieldValue({ type, display, options, locale, none }: { type: string; display: unknown; options: unknown; locale: string; none: string }) {
  if (display == null || display === "") return <>{none}</>;
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
      <ul>
        {(display as { system: string; level: string }[]).map((s) => (
          <li key={s.system}>
            {s.system} · <span className="text-ink-soft">{s.level}</span>
          </li>
        ))}
      </ul>
    );
  }
  if (type === "file") {
    const f = display as { fileName: string; url: string };
    return (
      <a className="underline" href={f.url}>
        📎 {f.fileName}
      </a>
    );
  }
  const optionList = Array.isArray(options) ? (options as { value: string; labelUk: string; labelEn?: string | null }[]) : null;
  const label = (v: string) => {
    const o = optionList?.find((x) => x.value === v);
    return o ? localized(locale, o.labelUk, o.labelEn) : v;
  };
  if (type === "multiselect" && Array.isArray(display)) return <>{(display as string[]).map(label).join(", ")}</>;
  if (type === "select") return <>{label(String(display))}</>;
  return <span className="whitespace-pre-wrap">{String(display)}</span>;
}
