import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { NavLinks } from "@/components/nav-links";
import { PageTitle } from "@/components/ui";
import { getActor } from "@/server/auth/session";
import { scopeOf } from "@/server/authz/policy";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor();
  if (scopeOf(actor, "settings.manage") !== "all") notFound();
  const t = await getTranslations("settings");
  return (
    <>
      <PageTitle>{t("title")}</PageTitle>
      <div className="mb-6">
        <NavLinks
          links={[
            { href: "/settings/calendars", label: t("calendars") },
            { href: "/settings/absences", label: t("absences") },
          ]}
        />
      </div>
      {children}
    </>
  );
}
