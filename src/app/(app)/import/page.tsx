import { InformationCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { sectionIcons } from "@/components/icons";
import { ImportWizard } from "@/components/import-wizard";
import { PageTitle } from "@/components/ui";
import { getActor } from "@/server/auth/session";
import { scopeOf } from "@/server/authz/policy";
import { IMPORT_TEMPLATES } from "@/server/services/import";

export default async function ImportPage() {
  const actor = await getActor();
  if (scopeOf(actor, "import.run") !== "all") notFound();
  const t = await getTranslations();
  return (
    <>
      <PageTitle icon={sectionIcons.import} subtitle={t("admin2.importSubtitle")}>
        {t("import.title")}
      </PageTitle>
      <p className="mb-4 flex items-start gap-2.5 rounded-2xl border border-blue/15 bg-blue-tint px-4 py-3 text-sm text-blue">
        <HugeiconsIcon icon={InformationCircleIcon} size={20} className="mt-px shrink-0" />
        {t("import.order")}
      </p>
      <ImportWizard templates={IMPORT_TEMPLATES} />
    </>
  );
}
