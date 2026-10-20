import { getLocale, getTranslations } from "next-intl/server";
import { Card, LinkButton, PageTitle } from "@/components/ui";
import { localized } from "@/lib/format";
import { getActor } from "@/server/auth/session";
import { getDashboard } from "@/server/services/dashboard";
import { getMe } from "@/server/services/me";

export default async function DashboardPage() {
  const actor = await getActor();
  const [me, data] = await Promise.all([getMe(actor), getDashboard(actor)]);
  const t = await getTranslations("dashboard");
  const locale = await getLocale();

  return (
    <>
      <PageTitle actions={me.employee && <LinkButton variant="secondary" href={`/employees/${me.employee.id}`}>{t("myProfile")}</LinkButton>}>
        {t("greeting", { name: me.employee?.name ?? me.email })}
      </PageTitle>
      <p className="-mt-4 mb-6 text-sm text-ink-soft">{t("role", { role: localized(locale, me.role.nameUk, me.role.nameEn) })}</p>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label={t("headcount")} value={data.headcount} />
        <Stat label={t("departments")} value={data.departments} />
        <Stat label={t("companies")} value={data.companies} />
      </div>
      {data.headcount > 0 && (
        <Card className="mt-6" title={t("headcount")}>
          <ul className="grid gap-3 sm:grid-cols-3">
            {data.byCompany.map((c) => (
              <li key={c.id} className="flex items-baseline justify-between border-b border-line pb-2">
                <span className="font-medium">{c.name}</span>
                <span className="font-display text-2xl">{c.count}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <p className="mt-8 text-sm text-ink-mute">{t("phaseNote")}</p>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-line bg-paper p-5">
      <p className="label">{label}</p>
      <p className="font-display text-4xl font-semibold">{value}</p>
    </div>
  );
}
