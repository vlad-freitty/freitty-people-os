"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { api } from "./api";
import { ErrorBox } from "./error-box";
import { useModalClose } from "./overlay";
import { Button, Field } from "./ui";

/** Manual balance adjustment — shown in a dialog on the profile; closes it after saving. */
export function BalanceAdjustForm({ employeeId, types }: { employeeId: string; types: { id: string; name: string }[] }) {
  const t = useTranslations("balance");
  const tc = useTranslations("common");
  const router = useRouter();
  const close = useModalClose();
  const [absenceTypeId, setType] = useState(types[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [comment, setComment] = useState("");
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
            await api(`/employees/${employeeId}/balance`, { body: { absenceTypeId, amount: Number(amount), comment } });
            setAmount("");
            setComment("");
            router.refresh();
            close?.();
          } catch (err) {
            setError(err);
          }
        });
      }}
    >
      <ErrorBox error={error} />
      <Field label={t("type")}>
        <select className="field" value={absenceTypeId} onChange={(e) => setType(e.target.value)}>
          {types.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
        <Field label={t("amount")}>
          <input className="field" type="number" step="0.5" required autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label={t("comment")}>
          <input className="field" required value={comment} onChange={(e) => setComment(e.target.value)} />
        </Field>
      </div>
      <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
        {close && (
          <Button type="button" variant="secondary" onClick={close}>
            {tc("cancel")}
          </Button>
        )}
        <Button disabled={pending}>{t("apply")}</Button>
      </div>
    </form>
  );
}

export function CancelAbsenceButton({ absenceId }: { absenceId: string }) {
  const t = useTranslations("balance");
  const router = useRouter();
  const [error, setError] = useState<unknown>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <Button
        variant="danger"
        className="min-h-8! px-3! py-1! text-xs!"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            try {
              await api(`/absences/${absenceId}/cancel`, { method: "POST" });
              router.refresh();
            } catch (err) {
              setError(err);
            }
          })
        }
      >
        {t("cancel")}
      </Button>
      <ErrorBox error={error} />
    </>
  );
}
