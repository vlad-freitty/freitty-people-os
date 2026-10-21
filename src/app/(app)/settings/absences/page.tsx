import { getLocale, getTranslations } from "next-intl/server";
import { AbsenceTypeForm, PolicyAssign, PolicyForm, type AbsenceTypeDto, type PolicyDto } from "@/components/settings/absence-settings";
import { Badge, Card } from "@/components/ui";
import { localized } from "@/lib/format";
import { getActor } from "@/server/auth/session";
import { listAbsenceTypes, listPolicies, listPolicyAssignments } from "@/server/services/absences";
import { getOrgStructure } from "@/server/services/org";

export default async function AbsenceSettingsPage() {
  const actor = await getActor();
  const locale = await getLocale();
  const [types, policies, assignments, org, t] = await Promise.all([
    listAbsenceTypes(actor),
    listPolicies(actor),
    listPolicyAssignments(actor),
    getOrgStructure(actor),
    getTranslations("settings"),
  ]);
  const companyName = new Map(org.companies.map((c) => [c.id, c.name]));
  const typeOptions = types.map((x) => ({ id: x.id, name: localized(locale, x.nameUk, x.nameEn) }));
  // the grid shows only types that keep a balance and have at least one policy
  const gridTypes = types.filter((x) => x.deductsBalance && policies.some((p) => p.absenceTypeId === x.id));
  const policiesOf = (typeId: string) => policies.filter((p) => p.absenceTypeId === typeId).map((p) => ({ id: p.id, name: p.name }));
  const rows = [
    ...org.companies.map((c) => ({ targetType: "company" as const, id: c.id, label: c.name })),
    ...org.departments.map((d) => ({ targetType: "department" as const, id: d.id, label: `${companyName.get(d.companyId)} · ${d.name}` })),
  ];

  return (
    <div className="space-y-6">
      <Card title={t("types")}>
        <div className="space-y-3">
          {types.map((x) => (
            <AbsenceTypeForm key={x.id} type={x as AbsenceTypeDto} />
          ))}
          <AbsenceTypeForm />
        </div>
      </Card>
      <Card title={t("policies")}>
        <p className="mb-3 text-sm text-ink-mute">{t("policiesHint")}</p>
        <div className="space-y-3">
          {policies.map((p) => (
            <div key={p.id}>
              <p className="mb-1 flex flex-wrap items-center gap-2 text-sm font-medium">
                <span className="size-2 rounded-full" style={{ backgroundColor: p.absenceType.color }} aria-hidden />
                {localized(locale, p.absenceType.nameUk, p.absenceType.nameEn)}
                {p.isDefault && <Badge tone="ok">{t("default")}</Badge>}
              </p>
              <PolicyForm policy={p as PolicyDto} types={typeOptions} />
              {(p.companies.length > 0 || p.departments.length > 0 || p.employeeCount > 0) && (
                <p className="mt-1 text-xs text-ink-mute">
                  {[...p.companies, ...p.departments].join(", ")}
                  {p.employeeCount > 0 && ` · ${p.employeeCount} ${t("employees")}`}
                </p>
              )}
            </div>
          ))}
          <PolicyForm types={typeOptions} />
        </div>
      </Card>
      {gridTypes.length > 0 && (
        <Card title={t("assignPolicy")}>
          <p className="mb-3 text-sm text-ink-mute">{t("assignHint")}</p>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th />
                  {gridTypes.map((x) => (
                    <th key={x.id}>{localized(locale, x.nameUk, x.nameEn)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.targetType}:${r.id}`}>
                    <td className={r.targetType === "company" ? "font-medium" : "text-ink-soft"}>{r.label}</td>
                    {gridTypes.map((x) => (
                      <td key={x.id}>
                        <PolicyAssign
                          targetType={r.targetType}
                          targetId={r.id}
                          absenceTypeId={x.id}
                          label={`${r.label} · ${localized(locale, x.nameUk, x.nameEn)}`}
                          current={assignments[`${r.targetType}:${r.id}`]?.[x.id] ?? null}
                          policies={policiesOf(x.id)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
