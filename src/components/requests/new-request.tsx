"use client";

import {
  Briefcase01Icon,
  Calendar03Icon,
  CheckmarkCircle02Icon,
  FileEditIcon,
  GiftIcon,
  Key01Icon,
  SentIcon,
  UserAdd01Icon,
  UserRemove01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { localized } from "@/lib/format";
import { api } from "../api";
import { ErrorBox } from "../error-box";
import { Button, Card, EmptyState, FormSection, IconTile, type TileTone } from "../ui";
import { AbsenceInsightPreview } from "./absence-insight";
import { FieldInput, type FieldDef, type Lookups } from "./field-input";

type RequestTypeDef = { id: string; nameUk: string; nameEn: string | null; kind: string; fields: FieldDef[] };

/** Icon and colour per request kind, so the type tiles are told apart at a glance. */
const KIND_LOOK: Record<string, { icon: IconSvgElement; tone: TileTone }> = {
  absence: { icon: Calendar03Icon, tone: "warn" },
  onboarding: { icon: UserAdd01Icon, tone: "ok" },
  offboarding: { icon: UserRemove01Icon, tone: "red" },
  access: { icon: Key01Icon, tone: "blue" },
  hiring: { icon: Briefcase01Icon, tone: "blue" },
  bonus: { icon: GiftIcon, tone: "ok" },
};
const KINDS_WITH_HINT = ["generic", "hiring", "onboarding", "access", "offboarding", "absence", "bonus"];
// wide controls take the whole row of the two-column form
const WIDE = new Set(["textarea", "systems", "multiselect", "file"]);

export function NewRequest({ types, lookups, initialTypeId }: { types: RequestTypeDef[]; lookups: Lookups; initialTypeId?: string }) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [typeId, setTypeId] = useState(initialTypeId ?? "");
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<unknown>(null);
  const [pending, start] = useTransition();
  const type = types.find((x) => x.id === typeId);

  if (types.length === 0) return <EmptyState icon={FileEditIcon} title={t("requests.noTypes")} />;

  return (
    <div className="space-y-6">
      <section className="rounded-card border border-edge bg-paper p-5 shadow-[0_1px_1px_rgba(28,39,76,0.04)]">
        <FormSection n={1} title={t("requests2.chooseTypeStep")}>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {types.map((x) => {
              const look = KIND_LOOK[x.kind] ?? { icon: FileEditIcon, tone: "neutral" as const };
              const active = x.id === typeId;
              return (
                <button
                  key={x.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => (setTypeId(x.id), setValues({}), setError(null))}
                  className={`relative flex items-start gap-3 rounded-2xl border p-4 text-left transition ${
                    active ? "border-red bg-red-tint/30 ring-2 ring-red/15" : "border-line bg-paper hover:border-line-strong hover:bg-cream"
                  }`}
                >
                  <IconTile icon={look.icon} tone={look.tone} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold text-ink-2">{localized(locale, x.nameUk, x.nameEn)}</span>
                    {KINDS_WITH_HINT.includes(x.kind) && <span className="mt-0.5 block text-xs text-ink-mute">{t(`requests2.kindHint.${x.kind}` as "requests2.kindHint.generic")}</span>}
                  </span>
                  {active && <HugeiconsIcon icon={CheckmarkCircle02Icon} size={20} className="shrink-0 text-red" />}
                </button>
              );
            })}
          </div>
        </FormSection>
      </section>

      {type && (
        <Card
          icon={(KIND_LOOK[type.kind] ?? { icon: FileEditIcon }).icon}
          tone={(KIND_LOOK[type.kind] ?? { tone: "neutral" as const }).tone}
          title={
            <span className="flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-full bg-navy text-xs text-white">2</span>
              {localized(locale, type.nameUk, type.nameEn)}
            </span>
          }
          subtitle={t("requests2.fillHint")}
        >
          <form
            className="space-y-5"
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
            <div className="grid gap-4 sm:grid-cols-2">
              {type.fields.map((f) => (
                <div key={f.key} className={WIDE.has(f.type) ? "sm:col-span-2" : ""}>
                  <FieldInput field={f} value={values[f.key]} lookups={lookups} onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))} />
                </div>
              ))}
            </div>
            {type.kind === "absence" && <AbsenceInsightPreview values={values} />}
            <div className="flex justify-end border-t border-line pt-4">
              <Button type="submit" disabled={pending}>
                <HugeiconsIcon icon={SentIcon} size={18} />
                {t("requests.submit")}
              </Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}
