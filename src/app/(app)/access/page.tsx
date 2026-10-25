import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { AccountsTable, IssueAccessButton, type AccountRow } from "@/components/access-admin";
import { Card, PageTitle, Stat } from "@/components/ui";
import { getActor } from "@/server/auth/session";
import { hasPermission } from "@/server/authz/policy";
import { accessFormOptions, listAccounts } from "@/server/services/users";

/** Accounts (phase 7): issue access with a one-time password, reset passwords, deactivate. */
export default async function AccessPage() {
  const actor = await getActor();
  if (!hasPermission(actor, "users.manage")) notFound();
  const [t, options, accounts] = await Promise.all([getTranslations("access"), accessFormOptions(actor), listAccounts(actor)]);
  const count = (fn: (a: (typeof accounts)[number]) => boolean) => accounts.filter(fn).length;
  const steps = [1, 2, 3] as const;
  return (
    <>
      <PageTitle subtitle={t("subtitle")} actions={<IssueAccessButton {...options} />}>
        {t("title")}
      </PageTitle>
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label={t("statTotal")} value={accounts.length} />
          <Stat label={t("statActive")} value={count((a) => a.isActive && a.hasPassword && !a.mustChangePassword)} tone="ok" />
          <Stat label={t("statPending")} value={count((a) => a.isActive && (a.mustChangePassword || !a.hasPassword))} tone="warn" />
          <Stat label={t("statInactive")} value={count((a) => !a.isActive)} tone="red" />
        </div>

        <ol className="grid gap-3 rounded-card border border-edge bg-paper p-4 sm:grid-cols-3 sm:p-5">
          {steps.map((n) => (
            <li key={n} className="flex gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-red-tint text-sm font-bold text-red">{n}</span>
              <span>
                <span className="block text-sm font-bold text-ink-2">{t(`step${n}Title`)}</span>
                <span className="block text-xs text-ink-mute">{t(`step${n}Hint`)}</span>
              </span>
            </li>
          ))}
        </ol>

        <Card>
          <AccountsTable accounts={accounts as AccountRow[]} meId={actor.userId} isSuperadmin={actor.isSuperadmin} />
        </Card>
      </div>
    </>
  );
}
