"use client";

import { InformationCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { api } from "./api";
import { ErrorBox } from "./error-box";
import { useModalClose } from "./overlay";
import { Button, Field } from "./ui";

/** New rate — shown in a dialog on the profile; closes it after saving. */
export function RateForm({ employeeId, defaultCurrency = "USD" }: { employeeId: string; defaultCurrency?: string }) {
  const t = useTranslations();
  const router = useRouter();
  const close = useModalClose();
  const [rateType, setRateType] = useState("hourly");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(defaultCurrency);
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [pending, start] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    start(async () => {
      try {
        await api(`/employees/${employeeId}/rates`, { body: { rateType, amount, currency, effectiveFrom } });
        setAmount("");
        setEffectiveFrom("");
        router.refresh();
        close?.();
      } catch (err) {
        setError(err);
      }
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <ErrorBox error={error} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("employee.rateType")}>
          <select className="field" value={rateType} onChange={(e) => setRateType(e.target.value)}>
            {(["hourly", "per_shift", "monthly"] as const).map((x) => (
              <option key={x} value={x}>
                {t(`rateType.${x}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("employee.effectiveFrom")}>
          <input className="field" required type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
        </Field>
        <Field label={t("employee.amount")}>
          <input className="field" required autoFocus inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label={t("employee.currency")}>
          <input className="field uppercase" required maxLength={3} value={currency} onChange={(e) => setCurrency(e.target.value)} />
        </Field>
      </div>
      <p className="flex items-start gap-2 rounded-xl bg-cream px-3.5 py-3 text-xs text-ink-soft">
        <HugeiconsIcon icon={InformationCircleIcon} size={16} className="mt-px shrink-0" />
        {t("employee.rateHint")}
      </p>
      <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
        {close && (
          <Button type="button" variant="secondary" onClick={close}>
            {t("common.cancel")}
          </Button>
        )}
        <Button type="submit" disabled={pending}>
          {t("employee.addRate")}
        </Button>
      </div>
    </form>
  );
}
