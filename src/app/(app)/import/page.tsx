import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { ImportWizard } from "@/components/import-wizard";
import { Card, PageTitle } from "@/components/ui";
import { getActor } from "@/server/auth/session";
import { scopeOf } from "@/server/authz/policy";
import { IMPORT_TEMPLATES } from "@/server/services/import";

export default async function ImportPage() {
  const actor = await getActor();
  if (scopeOf(actor, "import.run") !== "all") notFound();
  const t = await getTranslations("import");
  return (
    <>
      <PageTitle>{t("title")}</PageTitle>
      <Card>
        <ImportWizard templates={IMPORT_TEMPLATES} />
      </Card>
    </>
  );
}
