import { Add01Icon, ArrowRight01Icon, Layers01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { sectionIcons } from "@/components/icons";
import { ModalButton } from "@/components/overlay";
import { kindIcons, kindTones } from "@/components/templates/icons";
import { NewTemplateForm } from "@/components/templates/new-template";
import { Badge, EmptyState, IconTile, PageTitle, Stat } from "@/components/ui";
import { localized } from "@/lib/format";
import { getActor } from "@/server/auth/session";
import { scopeOf } from "@/server/authz/policy";
import { getOrgStructure } from "@/server/services/org";
import { listTemplates } from "@/server/services/templates";

export default async function TemplatesPage() {
  const actor = await getActor();
  const scope = scopeOf(actor, "templates.manage");
  if (!scope || scope === "self") notFound();
  const [templates, org, t, locale] = await Promise.all([listTemplates(actor), getOrgStructure(actor), getTranslations(), getLocale()]);
  const companyName = new Map(org.companies.map((c) => [c.id, c.name]));
  const departments = org.departments
    .filter((d) => scope === "all" || actor.headedDepartmentIds.includes(d.id))
    .map((d) => ({ id: d.id, label: `${companyName.get(d.companyId)} · ${d.name}` }));
  const canCreate = scope === "all" || departments.length > 0;
  const newTemplate = canCreate && (
    <ModalButton label={t("templates.new")} icon={Add01Icon} title={t("templates.new")} modalIcon={Layers01Icon}>
      <NewTemplateForm departments={departments} canGlobal={scope === "all"} />
    </ModalButton>
  );
  const kindIcon = (kind: string) => kindIcons[kind as keyof typeof kindIcons] ?? kindIcons.generic;
  const kindTone = (kind: string) => kindTones[kind as keyof typeof kindTones] ?? "neutral";

  return (
    <>
      <PageTitle icon={sectionIcons.templates} subtitle={t("ops2.templatesSubtitle")} actions={newTemplate}>
        {t("templates.title")}
      </PageTitle>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t("ops2.templatesTotal")} value={templates.length} />
        <Stat label={t("ops2.templatesPublished")} value={templates.filter((x) => x.currentVersion).length} tone="ok" />
        <Stat label={t("templates.hasDraft")} value={templates.filter((x) => x.hasDraft).length} tone="warn" />
        <Stat label={t("templates.notPublished")} value={templates.filter((x) => !x.currentVersion).length} tone="red" />
      </div>

      {templates.length === 0 ? (
        <EmptyState icon={Layers01Icon} title={t("ops2.templatesEmpty")} hint={t("ops2.templatesEmptyHint")} action={newTemplate} />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {templates.map((tpl) => (
            <li key={tpl.id}>
              <Link
                href={`/templates/${tpl.id}`}
                className="group flex h-full flex-col rounded-card border border-edge bg-paper p-5 shadow-[0_1px_1px_rgba(28,39,76,0.04)] transition hover:border-line-strong hover:shadow-md"
              >
                <span className="flex items-start gap-3">
                  <IconTile icon={kindIcon(tpl.kind)} tone={kindTone(tpl.kind)} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold text-ink-2 group-hover:text-red">{localized(locale, tpl.nameUk, tpl.nameEn)}</span>
                    <span className="block truncate font-mono text-xs text-ink-mute">{tpl.code}</span>
                  </span>
                  <HugeiconsIcon icon={ArrowRight01Icon} size={18} className="mt-1 shrink-0 text-ink-mute transition group-hover:translate-x-0.5 group-hover:text-red" />
                </span>
                <span className="mt-4 flex flex-wrap gap-1.5">
                  <Badge>{t(`templates.kinds.${tpl.kind}`)}</Badge>
                  <Badge tone={tpl.department ? "neutral" : "ink"}>{tpl.department ?? t("templates.global")}</Badge>
                </span>
                <span className="mt-auto block pt-4">
                  <span className="flex flex-wrap gap-1.5 border-t border-line pt-3">
                    {tpl.currentVersion ? <Badge tone="ok">{t("ops2.publishedVersion", { v: tpl.currentVersion })}</Badge> : <Badge tone="red">{t("templates.notPublished")}</Badge>}
                    {tpl.hasDraft && <Badge tone="warn">{t("templates.hasDraft")}</Badge>}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
