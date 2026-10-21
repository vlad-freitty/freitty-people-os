"use client";

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
    <div className="mt-3 space-y-3 rounded-xl border border-ink/15 bg-cream/70 p-3">
      <ErrorBox error={error} />

      {step.stepType === "approve" && (
        <>
          <Field label={t("comment")}>
            <textarea className="field min-h-16" value={comment} onChange={(e) => setComment(e.target.value)} />
          </Field>
          <p className="text-xs text-ink-mute">{t("rejectHint")}</p>
          <div className="flex gap-2">
            <Button disabled={pending} onClick={() => act({ action: "approve", comment: comment || undefined })}>
              {t("approve")}
            </Button>
            <Button variant="danger" disabled={pending || !comment.trim()} onClick={() => act({ action: "reject", comment })}>
              {t("reject")}
            </Button>
          </div>
        </>
      )}

      {step.stepType === "task" &&
        (step.checklist.length > 0 ? (
          <>
            <ul className="space-y-1.5">
              {step.checklist.map((item, i) => (
                <li key={i}>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
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
              <textarea className="field min-h-16" value={comment} onChange={(e) => setComment(e.target.value)} />
            </Field>
            <Button disabled={pending} onClick={() => act({ action: "complete", comment: comment || undefined })}>
              {t("complete")}
            </Button>
          </>
        ))}

      {step.stepType === "fill" && (
        <form
          className="space-y-3"
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
            {t("fillSubmit")}
          </Button>
        </form>
      )}

      {step.stepType === "document" && (
        <form
          className="space-y-3"
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
          <Field label={t("file")}>
            <input type="file" className="field" required onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </Field>
          <Field label={t("validTo")}>
            <input type="date" className="field" value={validTo} onChange={(e) => setValidTo(e.target.value)} />
          </Field>
          <Button type="submit" disabled={pending || !file}>
            {t("upload")}
          </Button>
        </form>
      )}

      {step.stepType === "child_request" && !step.childRequest && (
        <Button disabled={pending} onClick={() => act({ action: "start_child", values: {} })}>
          {t("startChild")}
        </Button>
      )}
    </div>
  );
}

export function ReassignControl({ stepId, people }: { stepId: string; people: { id: string; label: string }[] }) {
  const t = useTranslations("step");
  const { error, pending, run } = useAction();
  const [assigneeId, setAssigneeId] = useState("");
  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <select className="field max-w-xs py-1 text-xs" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} aria-label={t("assignee")}>
          <option value="" />
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <Button variant="secondary" className="py-1 text-xs" disabled={pending || !assigneeId} onClick={() => run(() => api(`/steps/${stepId}/assignee`, { method: "PUT", body: { assigneeId } }))}>
          {t("reassign")}
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
      <textarea className="field min-h-16" placeholder={t("addComment")} value={body} onChange={(e) => setBody(e.target.value)} />
      <Button type="submit" variant="secondary" disabled={pending || !body.trim()}>
        {t("send")}
      </Button>
    </form>
  );
}

export function CancelRequestButton({ requestId }: { requestId: string }) {
  const t = useTranslations("requests");
  const { error, pending, run } = useAction();
  return (
    <>
      <Button
        variant="ghost"
        disabled={pending}
        onClick={() => {
          if (confirm(t("cancelConfirm"))) run(() => api(`/requests/${requestId}/cancel`, { method: "POST" }));
        }}
      >
        {t("cancel")}
      </Button>
      <ErrorBox error={error} />
    </>
  );
}
