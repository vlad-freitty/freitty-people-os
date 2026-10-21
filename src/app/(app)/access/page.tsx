import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { AccountsTable, NewAccessForm, type AccountRow } from "@/components/access-admin";
import { Card, PageTitle } from "@/components/ui";
import { getActor } from "@/server/auth/session";
import { hasPermission } from "@/server/authz/policy";
import { accessFormOptions, listAccounts } from "@/server/services/users";

/** Accounts (phase 7): issue access with a one-time password, reset passwords, deactivate. */
export default async function AccessPage() {
  const actor = await getActor();
  if (!hasPermission(actor, "users.manage")) notFound();
  const [t, options, accounts] = await Promise.all([getTranslations("access"), accessFormOptions(actor), listAccounts(actor)]);
  return (
    <>
      <PageTitle subtitle={t("subtitle")}>{t("title")}</PageTitle>
      <div className="space-y-6">
        <Card title={t("new")}>
          <NewAccessForm {...options} />
        </Card>
        <Card title={t("accounts", { n: accounts.length })}>
          <AccountsTable accounts={accounts as AccountRow[]} meId={actor.userId} isSuperadmin={actor.isSuperadmin} />
        </Card>
      </div>
    </>
  );
}
