"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { localized } from "@/lib/format";
import { api } from "../api";
import { ErrorBox } from "../error-box";
import { Button, Card } from "../ui";
import { FieldInput, type FieldDef, type Lookups } from "./field-input";

type RequestTypeDef = { id: string; nameUk: string; nameEn: string | null; kind: string; fields: FieldDef[] };

export function NewRequest({ types, lookups, initialTypeId }: { types: RequestTypeDef[]; lookups: Lookups; initialTypeId?: string }) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [typeId, setTypeId] = useState(initialTypeId ?? "");
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<unknown>(null);
  const [pending, start] = useTransition();
  const type = types.find((x) => x.id === typeId);

  if (types.length === 0) return <p className="text-sm text-ink-mute">{t("requests.noTypes")}</p>;

  return (
    <div className="space-y-6">
      <div>
        <p className="label">{t("requests.chooseType")}</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {types.map((x) => (
            <button
              key={x.id}
              type="button"
              onClick={() => (setTypeId(x.id), setValues({}), setError(null))}
              className={`rounded-xl border p-4 text-left transition ${x.id === typeId ? "border-ink bg-paper shadow-sm" : "border-line bg-paper/60 hover:border-ink/40"}`}
            >
              <span className="font-display text-lg font-semibold">{localized(locale, x.nameUk, x.nameEn)}</span>
              <span className="block text-xs text-ink-mute">{t(`templates.kinds.${x.kind}` as "templates.kinds.generic")}</span>
            </button>
          ))}
        </div>
      </div>

      {type && (
        <Card title={localized(locale, type.nameUk, type.nameEn)}>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                setError(null);
                try {
                  const res = await api<{ id: string }>("/requests", { body: { requestTypeId: type.id, values } });
                  router.push(`/requests/${res.id}`);
                  router.refresh();
                } catch (err) {
                  setError(err);
                }
              });
            }}
          >
            <ErrorBox error={error} />
            {type.fields.map((f) => (
              <FieldInput key={f.key} field={f} value={values[f.key]} lookups={lookups} onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))} />
            ))}
            <Button type="submit" disabled={pending}>
              {t("requests.submit")}
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}
