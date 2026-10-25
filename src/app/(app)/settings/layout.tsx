import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { sectionIcons } from "@/components/icons";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { PageTitle } from "@/components/ui";
import { getActor } from "@/server/auth/session";
import { scopeOf } from "@/server/authz/policy";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor();
  if (scopeOf(actor, "settings.manage") !== "all") notFound();
  const t = await getTranslations();
  return (
    <>
      <PageTitle icon={sectionIcons.settings} subtitle={t("admin2.settingsSubtitle")}>
        {t("settings.title")}
      </PageTitle>
      <div className="mb-6">
        <SettingsTabs
          tabs={[
            { key: "calendars", href: "/settings/calendars", label: t("settings.calendars"), hint: t("admin2.calendarsTabHint") },
            { key: "absences", href: "/settings/absences", label: t("settings.absences"), hint: t("admin2.absencesTabHint") },
          ]}
        />
      </div>
      {children}
    </>
  );
}
