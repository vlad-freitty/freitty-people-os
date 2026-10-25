"use client";

import { CancelCircleIcon, PlayIcon, SentIcon, ThumbsDownIcon, ThumbsUpIcon, Tick02Icon, Upload01Icon, UserSwitchIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { localized } from "@/lib/format";
import { api, ApiRequestError } from "../api";
import { ErrorBox } from "../error-box";
import { Button, Field } from "../ui";
import { FieldInput, type FieldDef, type Lookups } from "./field-input";

type Step = {
  id: string;
  stepType: "approve" | "task" | "fill" | "document" | "child_request";
  checklist: { labelUk: string; labelEn?: string | null }[];
  checked: number[];
  requiredFields: string[];
  childRequest: { id: string } | null;
};

function useAction() {
  const router = useRouter();
  const [error, setError] = useState<unknown>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      setError(null);
      try {
        await fn();
        router.refresh();
      } catch (err) {
        setError(err);
      }
    });
  return { error, pending, run };
}

/** Action panel for the step assigned to the current user. The server re-checks everything. */
export function StepActions({ step, fields, lookups }: { step: Step; fields: FieldDef[]; lookups: Lookups }) {
  const t = useTranslations("step");
  const locale = useLocale();
  const { error, pending, run } = useAction();
  const [comment, setComment] = useState("");
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [checked, setChecked] = useState<number[]>(step.checked);
  const [file, setFile] = useState<File | null>(null);
  const [validTo, setValidTo] = useState("");
  const act = (body: unknown) => run(() => api(`/steps/${step.id}`, { body }));

  return (
    <div className="space-y-4">
      <ErrorBox error={error} />

      {step.stepType === "approve" && (
        <>
          <Field label={t("comment")}>
            <textarea className="field min-h-20" value={comment} onChange={(e) => setComment(e.target.value)} />
          </Field>
          <p className="text-xs text-ink-mute">{t("rejectHint")}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button disabled={pending} onClick={() => act({ action: "approve", comment: comment || undefined })}>
              <HugeiconsIcon icon={ThumbsUpIcon} size={18} />
              {t("approve")}
            </Button>
            <Button variant="danger" disabled={pending || !comment.trim()} onClick={() => act({ action: "reject", comment })}>
              <HugeiconsIcon icon={ThumbsDownIcon} size={18} />
              {t("reject")}
            </Button>
          </div>
        </>
      )}

      {step.stepType === "task" &&
        (step.checklist.length > 0 ? (
          <>
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
              {step.checklist.map((item, i) => (
                <li key={i}>
                  <label className={`flex cursor-pointer items-center gap-3 px-4 py-3 text-sm transition hover:bg-cream ${checked.includes(i) ? "text-ink-mute line-through" : "text-ink-2"}`}>
                    <input
                      type="checkbox"
                      className="size-4 accent-red"
                      disabled={pending}
                      checked={checked.includes(i)}
                      onChange={(e) => {
                        const next = e.target.checked ? [...checked, i] : checked.filter((x) => x !== i);
                        setChecked(next);
                        act({ action: "checklist", checked: next });
                      }}
                    />
                    {localized(locale, item.labelUk, item.labelEn)}
                  </label>
                </li>
              ))}
            </ul>
            <p className="text-xs text-ink-mute">{t("checklistHint")}</p>
          </>
        ) : (
          <>
            <Field label={t("comment")}>
              <textarea className="field min-h-20" value={comment} onChange={(e) => setComment(e.target.value)} />
            </Field>
            <Button disabled={pending} onClick={() => act({ action: "complete", comment: comment || undefined })}>
              <HugeiconsIcon icon={Tick02Icon} size={18} />
              {t("complete")}
            </Button>
          </>
        ))}

      {step.stepType === "fill" && (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            act({ action: "fill", values });
          }}
        >
          {fields
            .filter((f) => step.requiredFields.includes(f.key))
            .map((f) => (
              <FieldInput key={f.key} field={{ ...f, required: true }} value={values[f.key]} lookups={lookups} onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))} />
            ))}
          <Button type="submit" disabled={pending}>
            <HugeiconsIcon icon={Tick02Icon} size={18} />
            {t("fillSubmit")}
          </Button>
        </form>
      )}

      {step.stepType === "document" && (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!file) return;
            run(async () => {
              const body = new FormData();
              body.append("file", file);
              if (validTo) body.append("validTo", validTo);
              const res = await fetch(`/api/v1/steps/${step.id}/document`, { method: "POST", body });
              if (!res.ok) {
                const json = await res.json().catch(() => ({}));
                throw new ApiRequestError(json.error ?? { code: "internal_error" }, res.status);
              }
            });
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("file")}>
              <input type="file" className="field" required onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </Field>
            <Field label={t("validTo")}>
              <input type="date" className="field" value={validTo} onChange={(e) => setValidTo(e.target.value)} />
            </Field>
          </div>
          <Button type="submit" disabled={pending || !file}>
            <HugeiconsIcon icon={Upload01Icon} size={18} />
            {t("upload")}
          </Button>
        </form>
      )}

      {step.stepType === "child_request" && !step.childRequest && (
        <Button disabled={pending} onClick={() => act({ action: "start_child", values: {} })}>
          <HugeiconsIcon icon={PlayIcon} size={18} />
          {t("startChild")}
        </Button>
      )}
    </div>
  );
}

export function ReassignControl({ stepId, people }: { stepId: string; people: { id: string; label: string }[] }) {
  const t = useTranslations();
  const { error, pending, run } = useAction();
  const [assigneeId, setAssigneeId] = useState("");
  return (
    <div className="mt-3 space-y-2 border-t border-line pt-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <select className="field sm:max-w-xs" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} aria-label={t("step.assignee")}>
          <option value="">{t("requests2.choosePerson")}</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <Button variant="secondary" disabled={pending || !assigneeId} onClick={() => run(() => api(`/steps/${stepId}/assignee`, { method: "PUT", body: { assigneeId } }))}>
          <HugeiconsIcon icon={UserSwitchIcon} size={16} />
          {t("step.reassign")}
        </Button>
      </div>
      <ErrorBox error={error} />
    </div>
  );
}

export function CommentForm({ requestId }: { requestId: string }) {
  const t = useTranslations("requests");
  const { error, pending, run } = useAction();
  const [body, setBody] = useState("");
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          await api(`/requests/${requestId}/comments`, { body: { body } });
          setBody("");
        });
      }}
    >
      <ErrorBox error={error} />
      <textarea className="field min-h-20" placeholder={t("addComment")} value={body} onChange={(e) => setBody(e.target.value)} />
      <div className="flex justify-end">
        <Button type="submit" variant="secondary" disabled={pending || !body.trim()}>
          <HugeiconsIcon icon={SentIcon} size={16} />
          {t("send")}
        </Button>
      </div>
    </form>
  );
}

export function CancelRequestButton({ requestId }: { requestId: string }) {
  const t = useTranslations("requests");
  const { error, pending, run } = useAction();
  return (
    <>
      <Button
        variant="danger"
        disabled={pending}
        onClick={() => {
          if (confirm(t("cancelConfirm"))) run(() => api(`/requests/${requestId}/cancel`, { method: "POST" }));
        }}
      >
        <HugeiconsIcon icon={CancelCircleIcon} size={18} />
        {t("cancel")}
      </Button>
      <ErrorBox error={error} />
    </>
  );
}
