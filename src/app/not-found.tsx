import { ArrowLeft01Icon, FileNotFoundIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { getTranslations } from "next-intl/server";
import { IconTile, LinkButton } from "@/components/ui";

export default async function NotFound() {
  const t = await getTranslations("errorPage");
  return (
    <main className="flex min-h-[70vh] items-center justify-center px-4 py-10">
      <div className="flex w-full max-w-md flex-col items-center rounded-card border border-edge bg-paper px-6 py-10 text-center shadow-[0_1px_1px_rgba(28,39,76,0.04)]">
        <IconTile icon={FileNotFoundIcon} size={56} />
        <p className="mt-4 text-5xl font-bold tracking-tight text-red">404</p>
        <h1 className="mt-2 text-xl font-bold text-ink">{t("notFoundTitle")}</h1>
        <p className="mt-1 text-sm text-ink-soft">{t("notFoundText")}</p>
        <LinkButton href="/" className="mt-6">
          <HugeiconsIcon icon={ArrowLeft01Icon} size={16} />
          {t("home")}
        </LinkButton>
      </div>
    </main>
  );
}
