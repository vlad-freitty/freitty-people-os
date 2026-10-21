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
    <div role="group" aria-label={t("language")} className="flex h-11 items-center gap-0.5 rounded-full border border-line bg-[#f7f8fb] p-1 text-xs font-medium">
      {(["uk", "en"] as const).map((l) => (
        <button
          key={l}
          type="button"
          disabled={pending}
          onClick={() => set(l)}
          aria-pressed={locale === l}
          className={`h-full rounded-full px-3 uppercase transition ${locale === l ? "bg-paper text-ink shadow-[0_1px_2px_rgba(16,24,40,0.08)]" : "text-ink-mute hover:text-ink"}`}
        >
          {l === "uk" ? "UA" : "EN"}
        </button>
      ))}
    </div>
  );
}
