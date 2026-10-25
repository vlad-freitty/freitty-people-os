"use client";

import { Alert02Icon, ArrowLeft01Icon, RefreshIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslations } from "next-intl";
import { Button, IconTile, LinkButton } from "@/components/ui";

/** Error boundary of the signed-in area: the message never shows server details to the user. */
export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("errorPage");
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="flex w-full max-w-md flex-col items-center rounded-card border border-edge bg-paper px-6 py-10 text-center shadow-[0_1px_1px_rgba(28,39,76,0.04)]">
        <IconTile icon={Alert02Icon} size={56} />
        <h1 className="mt-4 text-xl font-bold text-ink">{t("errorTitle")}</h1>
        <p className="mt-1 text-sm text-ink-soft">{t("errorText")}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button onClick={reset}>
            <HugeiconsIcon icon={RefreshIcon} size={16} />
            {t("retry")}
          </Button>
          <LinkButton variant="secondary" href="/">
            <HugeiconsIcon icon={ArrowLeft01Icon} size={16} />
            {t("home")}
          </LinkButton>
        </div>
      </div>
    </div>
  );
}
