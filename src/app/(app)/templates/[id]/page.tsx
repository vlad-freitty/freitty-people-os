import { getLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { TemplateEditor, type EditorProps } from "@/components/templates/template-editor";
import { PageTitle } from "@/components/ui";
import { localized } from "@/lib/format";
import { getActor } from "@/server/auth/session";
import { ForbiddenError, NotFoundError } from "@/server/errors";
import { listEmployees } from "@/server/services/employees";
import { getOrgStructure } from "@/server/services/org";
import { constructorOptions, getTemplate } from "@/server/services/templates";

export default async function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getActor();
  const template = await getTemplate(actor, id).catch((err) => {
    if (err instanceof NotFoundError || err instanceof ForbiddenError) notFound();
    throw err;
  });
  const [options, people, org, locale] = await Promise.all([constructorOptions(actor), listEmployees(actor), getOrgStructure(actor), getLocale()]);
  const companyName = new Map(org.companies.map((c) => [c.id, c.name]));

  return (
    <>
      <PageTitle>{localized(locale, template.nameUk, template.nameEn)}</PageTitle>
      <TemplateEditor
        key={`${template.editingVersion?.version}-${template.editingVersion?.status}`}
        template={template as EditorProps["template"]}
        people={people.map((p) => ({ id: p.id, label: `${p.lastName} ${p.firstName} · ${p.department.name}` }))}
        roles={options.roles}
        childTypes={options.childTypes}
        departments={org.departments.map((d) => ({ id: d.id, label: `${companyName.get(d.companyId)} · ${d.name}` }))}
      />
    </>
  );
}
