import { getLocale, getTranslations } from "next-intl/server";
import { NewRequest } from "@/components/requests/new-request";
import { PageTitle } from "@/components/ui";
import { getActor } from "@/server/auth/session";
import { listInitiableTypes } from "@/server/services/requests";
import { requestLookups } from "../lookups";

export default async function NewRequestPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const actor = await getActor();
  const [{ type }, types, lookups, t] = await Promise.all([searchParams, listInitiableTypes(actor), requestLookups(actor, await getLocale()), getTranslations("requests")]);
  return (
    <>
      <PageTitle>{t("new")}</PageTitle>
      <NewRequest types={types} lookups={lookups} initialTypeId={type} />
    </>
  );
}
