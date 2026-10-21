import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { NewTemplateForm } from "@/components/templates/new-template";
import { Badge, Card, PageTitle } from "@/components/ui";
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

  return (
    <>
      <PageTitle>{t("templates.title")}</PageTitle>
      <div className="space-y-6">
        <div className="overflow-x-auto rounded-card border border-edge bg-paper">
          <table className="table">
            <thead>
              <tr>
                <th>{t("templates.nameUk")}</th>
                <th>{t("templates.kind")}</th>
                <th>{t("templates.department")}</th>
                <th>{t("templates.version")}</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((tpl) => (
                <tr key={tpl.id} className="hover:bg-cream/60">
                  <td>
                    <Link href={`/templates/${tpl.id}`} className="font-medium hover:text-red">
                      {localized(locale, tpl.nameUk, tpl.nameEn)}
                    </Link>
                    <span className="block font-mono text-xs text-ink-mute">{tpl.code}</span>
                  </td>
                  <td>{t(`templates.kinds.${tpl.kind}`)}</td>
                  <td>{tpl.department ?? t("templates.global")}</td>
                  <td className="space-x-1">
                    {tpl.currentVersion ? <Badge tone="ok">v{tpl.currentVersion}</Badge> : <Badge>{t("templates.notPublished")}</Badge>}
                    {tpl.hasDraft && <Badge tone="warn">{t("templates.hasDraft")}</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {(scope === "all" || departments.length > 0) && (
          <Card title={t("templates.new")}>
            <NewTemplateForm departments={departments} canGlobal={scope === "all"} />
          </Card>
        )}
      </div>
    </>
  );
}
