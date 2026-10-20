import { getLocale, getTranslations } from "next-intl/server";
import { AssignmentsEditor, EventsEditor, LayerForm, WorkWeekEditor, type LayerDto } from "@/components/settings/calendar-settings";
import { Badge, Card } from "@/components/ui";
import { localized } from "@/lib/format";
import { getActor } from "@/server/auth/session";
import { DEFAULT_WORK_WEEK } from "@/server/calendar/core";
import { listLayers, listWorkWeeks } from "@/server/services/calendar";
import { getOrgStructure } from "@/server/services/org";

export default async function CalendarSettingsPage() {
  const actor = await getActor();
  const [layers, org, weeks, t, tc, locale] = await Promise.all([
    listLayers(actor),
    getOrgStructure(actor),
    listWorkWeeks(actor),
    getTranslations("settings"),
    getTranslations("calendar"),
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
      {layers.map((l) => (
        <Card
          key={l.id}
          title={
            <span className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: l.color }} />
              {localized(locale, l.nameUk, l.nameEn)}
            </span>
          }
          actions={
            <span className="flex gap-1">
              {l.systemKind && <Badge>{t("system")}</Badge>}
              <Badge tone={l.effect === "non_working" ? "red" : "neutral"}>{t(`effects.${l.effect}`)}</Badge>
              <Badge>{t(`visibilities.${l.visibility}`)}</Badge>
              <Badge>{t(`sources.${l.source as "manual"}`)}</Badge>
            </span>
          }
        >
          <div className="space-y-4">
            <LayerForm layer={l as LayerDto} />
            <details>
              <summary className="cursor-pointer text-sm font-medium">{t("assignments")}</summary>
              <div className="mt-3">
                <AssignmentsEditor layer={l as LayerDto} org={options} />
              </div>
            </details>
            {!l.systemKind && (
              <details>
                <summary className="cursor-pointer text-sm font-medium">
                  {t("events")} ({l.eventCount})
                </summary>
                <div className="mt-3">
                  <EventsEditor layerId={l.id} />
                </div>
              </details>
            )}
          </div>
        </Card>
      ))}
      <Card title={t("newLayer")}>
        <LayerForm />
      </Card>
      <Card title={t("workWeeks")}>
        <p className="mb-2 text-sm text-ink-soft">{t("workWeekHint")}</p>
        {org.locations.map((l) => (
          <WorkWeekEditor key={l.id} target={{ locationId: l.id }} label={l.name} initial={weekOf("locationId", l.id)} weekdays={weekdays} />
        ))}
        {org.companies.map((c) => (
          <WorkWeekEditor key={c.id} target={{ companyId: c.id }} label={c.name} initial={weekOf("companyId", c.id)} weekdays={weekdays} />
        ))}
      </Card>
    </div>
  );
}
