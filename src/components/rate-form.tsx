"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { api } from "./api";
import { ErrorBox } from "./error-box";
import { Button, Field } from "./ui";

export function RateForm({ employeeId, defaultCurrency = "USD" }: { employeeId: string; defaultCurrency?: string }) {
  const t = useTranslations();
  const router = useRouter();
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
      } catch (err) {
        setError(err);
      }
    });
  };

  return (
    <form onSubmit={submit} className="space-y-3 border-t border-line pt-4">
      <h3 className="text-sm font-semibold">{t("employee.addRate")}</h3>
      <ErrorBox error={error} />
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("employee.rateType")}>
          <select className="field" value={rateType} onChange={(e) => setRateType(e.target.value)}>
            {(["hourly", "per_shift", "monthly"] as const).map((x) => (
              <option key={x} value={x}>
                {t(`rateType.${x}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("employee.amount")}>
          <input className="field" required inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label={t("employee.currency")}>
          <input className="field uppercase" required maxLength={3} value={currency} onChange={(e) => setCurrency(e.target.value)} />
        </Field>
        <Field label={t("employee.effectiveFrom")}>
          <input className="field" required type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
        </Field>
      </div>
      <p className="text-xs text-ink-mute">{t("employee.rateHint")}</p>
      <Button type="submit" disabled={pending}>
        {t("common.add")}
      </Button>
    </form>
  );
}
