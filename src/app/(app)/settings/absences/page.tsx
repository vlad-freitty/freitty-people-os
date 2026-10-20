import { getTranslations } from "next-intl/server";
import { AbsenceTypeForm, PolicyAssign, PolicyForm, type AbsenceTypeDto, type PolicyDto } from "@/components/settings/absence-settings";
import { Card } from "@/components/ui";
import { getActor } from "@/server/auth/session";
import { listAbsenceTypes, listPolicies } from "@/server/services/absences";
import { getOrgStructure } from "@/server/services/org";

export default async function AbsenceSettingsPage() {
  const actor = await getActor();
  const [types, policies, org, t] = await Promise.all([listAbsenceTypes(actor), listPolicies(actor), getOrgStructure(actor), getTranslations("settings")]);
  const companyName = new Map(org.companies.map((c) => [c.id, c.name]));
  const policyOptions = policies.map((p) => ({ id: p.id, name: p.name }));

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
        <div className="space-y-3">
          {policies.map((p) => (
            <div key={p.id}>
              <PolicyForm policy={p as PolicyDto} />
              <p className="mt-1 text-xs text-ink-mute">
                {[...p.companies.map((c) => c.name), ...p.departments.map((d) => d.name)].join(", ")}
                {p.employeeCount > 0 && ` · ${p.employeeCount} ${t("employees")}`}
              </p>
            </div>
          ))}
          <PolicyForm />
        </div>
      </Card>
      <Card title={t("assignPolicy")}>
        <p className="label">{t("companies")}</p>
        {org.companies.map((c) => (
          <PolicyAssign key={c.id} targetType="company" targetId={c.id} label={c.name} current={c.absencePolicyId} policies={policyOptions} />
        ))}
        <p className="label mt-4">{t("departments")}</p>
        {org.departments.map((d) => (
          <PolicyAssign key={d.id} targetType="department" targetId={d.id} label={`${companyName.get(d.companyId)} · ${d.name}`} current={d.absencePolicyId} policies={policyOptions} />
        ))}
      </Card>
    </div>
  );
}
