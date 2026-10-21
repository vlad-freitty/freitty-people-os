"use client";

import { useTranslations } from "next-intl";
import { Button, LinkButton } from "@/components/ui";

/** Error boundary of the signed-in area: the message never shows server details to the user. */
export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("errorPage");
  return (
    <div className="flex min-h-[50vh] max-w-md flex-col items-start justify-center gap-3">
      <h1 className="text-2xl font-bold">{t("errorTitle")}</h1>
      <p className="text-sm text-ink-soft">{t("errorText")}</p>
      <div className="flex gap-2">
        <Button onClick={reset}>{t("retry")}</Button>
        <LinkButton variant="ghost" href="/">
          {t("home")}
        </LinkButton>
      </div>
    </div>
  );
}
