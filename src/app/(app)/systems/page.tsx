import { Add01Icon, ComputerIcon, Layers01Icon, PencilEdit02Icon } from "@hugeicons/core-free-icons";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { BundleForm, SystemForm } from "@/components/directories";
import { ModalButton } from "@/components/overlay";
import { sectionIcons } from "@/components/icons";
import { Badge, Card, EmptyState, PageTitle } from "@/components/ui";
import { getActor } from "@/server/auth/session";
import { scopeOf } from "@/server/authz/policy";
import { listEmployees } from "@/server/services/employees";
import { listBundles, listSystems } from "@/server/services/systems";

export default async function SystemsPage() {
  const actor = await getActor();
  if (scopeOf(actor, "systems.manage") !== "all") notFound();
  const [systems, bundles, people, t] = await Promise.all([listSystems(actor), listBundles(actor), listEmployees(actor), getTranslations()]);
  const peopleOptions = people.map((p) => ({ id: p.id, label: `${p.lastName} ${p.firstName}` }));
  const newSystem = (variant: "primary" | "secondary" = "primary") => (
    <ModalButton label={t("systems.newSystem")} icon={Add01Icon} variant={variant} title={t("systems.newSystem")} modalIcon={ComputerIcon}>
      <SystemForm people={peopleOptions} />
    </ModalButton>
  );
  const newBundle = (variant: "primary" | "secondary" = "primary") => (
    <ModalButton label={t("systems.newBundle")} icon={Add01Icon} variant={variant} title={t("systems.newBundle")} subtitle={t("systems.bundleHint")} modalIcon={Layers01Icon} size="lg">
      <BundleForm systems={systems} />
    </ModalButton>
  );

  return (
    <>
      <PageTitle icon={sectionIcons.systems} subtitle={t("systems.subtitle")}>{t("systems.title")}</PageTitle>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card icon={ComputerIcon} title={t("systems.systems")} subtitle={t("systems.systemsHint")} className="self-start" actions={systems.length > 0 && newSystem("secondary")}>
          {systems.length ? (
            <ul className="divide-y divide-line border-t border-line">
              {systems.map((s) => (
                <li key={s.id} className={`flex items-center gap-3 py-3 ${s.isActive ? "" : "opacity-60"}`}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-ink-2">{s.name}</p>
                    <p className="truncate text-xs text-ink-mute">
                      {t("systems.owner")}: {s.owner?.name ?? t("common.none")}
                    </p>
                  </div>
                  {s.isActive ? <Badge tone="ok">{t("systems.activeBadge")}</Badge> : <Badge>{t("systems.inactiveBadge")}</Badge>}
                  <ModalButton iconOnly icon={PencilEdit02Icon} label={t("common.edit")} title={s.name} modalIcon={ComputerIcon}>
                    <SystemForm people={peopleOptions} initial={{ id: s.id, name: s.name, ownerId: s.owner?.id ?? null, isActive: s.isActive }} />
                  </ModalButton>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={ComputerIcon} title={t("systems.noSystems")} hint={t("systems.noSystemsHint")} action={newSystem()} />
          )}
        </Card>

        <Card icon={Layers01Icon} title={t("systems.bundles")} subtitle={t("systems.bundleHint")} className="self-start" actions={bundles.length > 0 && newBundle("secondary")}>
          {bundles.length ? (
            <ul className="space-y-3">
              {bundles.map((b) => (
                <li key={b.id} className="rounded-2xl border border-line p-4">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-ink-2">{b.name}</p>
                      <p className="text-xs text-ink-mute">
                        {t("systems.position")}: <span className="font-medium text-ink-soft">{b.positionOrRole}</span>
                      </p>
                    </div>
                    <ModalButton iconOnly icon={PencilEdit02Icon} label={t("common.edit")} title={b.name} modalIcon={Layers01Icon} size="lg">
                      <BundleForm systems={systems} initial={{ id: b.id, name: b.name, positionOrRole: b.positionOrRole, items: b.items }} />
                    </ModalButton>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {b.items.length ? (
                      b.items.map((i) => (
                        <Badge key={i.systemId}>
                          {i.systemName}
                          {i.accessLevel && <span className="ml-1 text-ink-mute">· {i.accessLevel}</span>}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-xs text-ink-mute">{t("systems.noItems")}</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={Layers01Icon}
              title={t("systems.noBundles")}
              hint={systems.length ? t("systems.noBundlesHint") : t("systems.noBundlesNeedSystems")}
              action={systems.length > 0 && newBundle()}
            />
          )}
        </Card>
      </div>
    </>
  );
}
