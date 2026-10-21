import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { BundleForm, SystemForm } from "@/components/directories";
import { Card, PageTitle } from "@/components/ui";
import { getActor } from "@/server/auth/session";
import { scopeOf } from "@/server/authz/policy";
import { listEmployees } from "@/server/services/employees";
import { listBundles, listSystems } from "@/server/services/systems";

export default async function SystemsPage() {
  const actor = await getActor();
  if (scopeOf(actor, "systems.manage") !== "all") notFound();
  const [systems, bundles, people, t] = await Promise.all([listSystems(actor), listBundles(actor), listEmployees(actor), getTranslations("systems")]);
  const peopleOptions = people.map((p) => ({ id: p.id, label: `${p.lastName} ${p.firstName}` }));
  return (
    <>
      <PageTitle>{t("title")}</PageTitle>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={t("systems")}>
          <div className="space-y-3">
            {systems.map((s) => (
              <SystemForm key={s.id} people={peopleOptions} initial={{ id: s.id, name: s.name, ownerId: s.owner?.id ?? null, isActive: s.isActive }} />
            ))}
            <div className="border-t border-line pt-3">
              <SystemForm people={peopleOptions} />
            </div>
          </div>
        </Card>
        <Card title={t("bundles")}>
          <p className="mb-3 text-sm text-ink-soft">{t("bundleHint")}</p>
          <div className="space-y-5">
            {bundles.map((b) => (
              <div key={b.id} className="rounded-xl border border-line p-3">
                <BundleForm systems={systems} initial={{ id: b.id, name: b.name, positionOrRole: b.positionOrRole, items: b.items }} />
              </div>
            ))}
            <div className="border-t border-line pt-3">
              <BundleForm systems={systems} />
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
