"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { api } from "./api";
import { ErrorBox } from "./error-box";
import { Button, Field } from "./ui";

export function BalanceAdjustForm({ employeeId, types }: { employeeId: string; types: { id: string; name: string }[] }) {
  const t = useTranslations("balance");
  const router = useRouter();
  const [absenceTypeId, setType] = useState(types[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [comment, setComment] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-2 border-t border-line pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setError(null);
          try {
            await api(`/employees/${employeeId}/balance`, { body: { absenceTypeId, amount: Number(amount), comment } });
            setAmount("");
            setComment("");
            router.refresh();
          } catch (err) {
            setError(err);
          }
        });
      }}
    >
      <p className="text-sm font-semibold">{t("adjust")}</p>
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
      <div className="grid grid-cols-[1fr_2fr] gap-2">
        <Field label={t("amount")}>
          <input className="field" type="number" step="0.5" required value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label={t("comment")}>
          <input className="field" required value={comment} onChange={(e) => setComment(e.target.value)} />
        </Field>
      </div>
      <Button variant="secondary" disabled={pending}>
        {t("apply")}
      </Button>
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
        variant="ghost"
        className="px-2 py-0.5 text-xs"
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
