import { getTranslations } from "next-intl/server";
import { LinkButton } from "@/components/ui";

export default async function NotFound() {
  const t = await getTranslations("errorPage");
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-start justify-center gap-3 px-4">
      <p className="font-display text-6xl font-semibold text-red">404</p>
      <h1 className="font-display text-2xl font-semibold">{t("notFoundTitle")}</h1>
      <p className="text-sm text-ink-soft">{t("notFoundText")}</p>
      <LinkButton href="/">{t("home")}</LinkButton>
    </main>
  );
}
