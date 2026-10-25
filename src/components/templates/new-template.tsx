"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { api } from "../api";
import { ErrorBox } from "../error-box";
import { useModalClose } from "../overlay";
import { Button, Field } from "../ui";

const KINDS = ["generic", "hiring", "onboarding", "access", "offboarding"] as const;

/** departments: where the actor may create templates; canGlobal: superadmin-level templates.manage. */
export function NewTemplateForm({ departments, canGlobal }: { departments: { id: string; label: string }[]; canGlobal: boolean }) {
  const t = useTranslations("templates");
  const to = useTranslations("ops2");
  const tc = useTranslations("common");
  const close = useModalClose();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [nameUk, setNameUk] = useState("");
  const [kind, setKind] = useState<(typeof KINDS)[number]>("generic");
  const [departmentId, setDepartmentId] = useState(canGlobal ? "" : (departments[0]?.id ?? ""));
  const [error, setError] = useState<unknown>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setError(null);
          try {
            const whoCanInitiate = departmentId ? { mode: "departments", departmentIds: [departmentId] } : { mode: "all" };
            const res = await api<{ id: string }>("/templates", { body: { code, nameUk, kind, departmentId: departmentId || null, whoCanInitiate } });
            router.push(`/templates/${res.id}`);
          } catch (err) {
            setError(err);
          }
        });
      }}
    >
      <ErrorBox error={error} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("nameUk")} className="sm:col-span-2">
          <input className="field" required autoFocus value={nameUk} onChange={(e) => setNameUk(e.target.value)} />
        </Field>
        <Field label={t("code")}>
          <input className="field font-mono" required pattern="[a-z][a-z0-9_]{1,40}" placeholder="equipment_request" value={code} onChange={(e) => setCode(e.target.value)} />
          <span className="mt-1 block text-xs text-ink-mute">{to("codeHint")}</span>
        </Field>
        <Field label={t("kind")}>
          <select className="field" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`kinds.${k}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("department")}>
          <select className="field" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
            {canGlobal && <option value="">{t("global")}</option>}
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <p className="text-xs text-ink-mute">{to("newTemplateHint")}</p>
      <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
        {close && (
          <Button type="button" variant="secondary" onClick={close}>
            {tc("cancel")}
          </Button>
        )}
        <Button type="submit" disabled={pending}>
          {t("new")}
        </Button>
      </div>
    </form>
  );
}
