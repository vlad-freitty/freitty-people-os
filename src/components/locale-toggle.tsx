"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { api } from "./api";

export function LocaleToggle() {
  const locale = useLocale();
  const t = useTranslations("common");
  const router = useRouter();
  const [pending, start] = useTransition();
  const set = (next: "uk" | "en") =>
    start(async () => {
      await api("/me/locale", { method: "PUT", body: { locale: next } });
      router.refresh();
    });
  return (
    <div role="group" aria-label={t("language")} className="flex overflow-hidden rounded-md border border-line text-xs font-medium">
      {(["uk", "en"] as const).map((l) => (
        <button
          key={l}
          type="button"
          disabled={pending}
          onClick={() => set(l)}
          aria-pressed={locale === l}
          className={`px-2.5 py-1 uppercase transition ${locale === l ? "bg-ink text-cream" : "bg-paper text-ink-soft hover:text-ink"}`}
        >
          {l === "uk" ? "UA" : "EN"}
        </button>
      ))}
    </div>
  );
}
