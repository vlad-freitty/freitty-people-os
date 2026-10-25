import { Add01Icon, Calendar03Icon, CalendarLock01Icon, PencilEdit02Icon, UserGroupIcon, WorkHistoryIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { getLocale, getTranslations } from "next-intl/server";
import { ModalButton } from "@/components/overlay";
import { AssignmentsEditor, EventsEditor, LayerForm, WorkWeekEditor, type LayerDto } from "@/components/settings/calendar-settings";
import { Badge, Card, EmptyState } from "@/components/ui";
import { localized } from "@/lib/format";
import { getActor } from "@/server/auth/session";
import { DEFAULT_WORK_WEEK } from "@/server/calendar/core";
import { listLayers, listWorkWeeks } from "@/server/services/calendar";
import { getOrgStructure } from "@/server/services/org";

export default async function CalendarSettingsPage() {
  const actor = await getActor();
  const [layers, org, weeks, t, tc, ta, locale] = await Promise.all([
    listLayers(actor),
    getOrgStructure(actor),
    listWorkWeeks(actor),
    getTranslations("settings"),
    getTranslations("calendar"),
    getTranslations(),
    getLocale(),
  ]);
  const companyName = new Map(org.companies.map((c) => [c.id, c.name]));
  const options = {
    companies: org.companies.map((c) => ({ id: c.id, label: c.name })),
    departments: org.departments.map((d) => ({ id: d.id, label: `${companyName.get(d.companyId)} · ${d.name}` })),
    locations: org.locations.map((l) => ({ id: l.id, label: l.name })),
  };
  const weekdays = tc.raw("weekdays") as string[];
  const weekOf = (k: "locationId" | "companyId", id: string) => weeks.find((w) => w[k] === id)?.days ?? DEFAULT_WORK_WEEK;

  return (
    <div className="space-y-6">
      <Card
        icon={Calendar03Icon}
        title={t("calendars")}
        subtitle={ta("admin2.layersHint")}
        actions={
          <ModalButton label={t("newLayer")} icon={Add01Icon} variant="secondary" title={t("newLayer")} modalIcon={Calendar03Icon}>
            <LayerForm />
          </ModalButton>
        }
      >
        {layers.length === 0 ? (
          <EmptyState icon={Calendar03Icon} title={ta("admin2.noLayers")} />
        ) : (
          <ul className="-my-2 divide-y divide-line">
            {layers.map((l) => {
              const name = localized(locale, l.nameUk, l.nameEn);
              return (
                <li key={l.id} className="flex flex-col gap-3 py-3 lg:flex-row lg:items-center">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: `${l.color}22`, color: l.color }} aria-hidden>
                      <HugeiconsIcon icon={l.systemKind ? CalendarLock01Icon : Calendar03Icon} size={18} />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-ink-2">{name}</p>
                      <p className="mt-1 flex flex-wrap gap-1">
                        {l.systemKind && <Badge tone="ink">{t("system")}</Badge>}
                        <Badge tone={l.effect === "non_working" ? "red" : "neutral"}>{t(`effects.${l.effect}`)}</Badge>
                        <Badge>{t(`visibilities.${l.visibility}`)}</Badge>
                        <Badge>{t(`sources.${l.source as "manual"}`)}</Badge>
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pl-12 lg:pl-0">
                    <ModalButton
                      label={`${t("assignments")} · ${l.assignments.length}`}
                      icon={UserGroupIcon}
                      variant="secondary"
                      title={t("assignments")}
                      subtitle={name}
                      modalIcon={UserGroupIcon}
                      size="lg"
                    >
                      <AssignmentsEditor layer={l as LayerDto} org={options} />
                    </ModalButton>
                    {!l.systemKind && (
                      <ModalButton label={`${t("events")} · ${l.eventCount}`} icon={Calendar03Icon} variant="secondary" title={t("events")} subtitle={name} modalIcon={Calendar03Icon} size="lg">
                        <EventsEditor layerId={l.id} />
                      </ModalButton>
                    )}
                    <ModalButton iconOnly icon={PencilEdit02Icon} label={ta("common.edit")} title={name} modalIcon={Calendar03Icon}>
                      <LayerForm layer={l as LayerDto} />
                    </ModalButton>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card icon={WorkHistoryIcon} tone="blue" title={t("workWeeks")} subtitle={t("workWeekHint")}>
        {org.locations.length + org.companies.length === 0 ? (
          <EmptyState icon={WorkHistoryIcon} title={ta("common.noResults")} />
        ) : (
          <div className="-my-3 divide-y divide-line">
            {org.locations.map((l) => (
              <WorkWeekEditor key={l.id} target={{ locationId: l.id }} label={l.name} initial={weekOf("locationId", l.id)} weekdays={weekdays} />
            ))}
            {org.companies.map((c) => (
              <WorkWeekEditor key={c.id} target={{ companyId: c.id }} label={c.name} initial={weekOf("companyId", c.id)} weekdays={weekdays} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
