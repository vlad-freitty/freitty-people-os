import { Add01Icon, Calendar03Icon, DocumentValidationIcon, HierarchySquare01Icon, Home01Icon, PencilEdit02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { getLocale, getTranslations } from "next-intl/server";
import { ModalButton } from "@/components/overlay";
import { AbsenceTypeForm, PolicyAssign, PolicyForm, type AbsenceTypeDto, type PolicyDto } from "@/components/settings/absence-settings";
import { Badge, Card, EmptyState } from "@/components/ui";
import { localized } from "@/lib/format";
import { getActor } from "@/server/auth/session";
import { listAbsenceTypes, listPolicies, listPolicyAssignments } from "@/server/services/absences";
import { getOrgStructure } from "@/server/services/org";

const TYPE_FLAGS = [
  ["paid", "paid"],
  ["deductsBalance", "deducts"],
  ["requiresApproval", "requiresApproval"],
  ["requiresDocument", "requiresDocument"],
  ["allowHalfDay", "halfDay"],
  ["countsAsWorking", "countsAsWorking"],
] as const;

/** Colour chip of a type: rounded square tinted with the type's own colour. */
function TypeChip({ color, working }: { color: string; working?: boolean }) {
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: `${color}22`, color }} aria-hidden>
      <HugeiconsIcon icon={working ? Home01Icon : Calendar03Icon} size={18} />
    </span>
  );
}

export default async function AbsenceSettingsPage() {
  const actor = await getActor();
  const locale = await getLocale();
  const [types, policies, assignments, org, t, tc] = await Promise.all([
    listAbsenceTypes(actor),
    listPolicies(actor),
    listPolicyAssignments(actor),
    getOrgStructure(actor),
    getTranslations("settings"),
    getTranslations(),
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
  const newType = (
    <ModalButton label={t("newType")} icon={Add01Icon} variant="secondary" title={t("newType")} modalIcon={Calendar03Icon} size="lg">
      <AbsenceTypeForm />
    </ModalButton>
  );
  const newPolicy = (
    <ModalButton label={t("newPolicy")} icon={Add01Icon} variant="secondary" title={t("newPolicy")} subtitle={t("policiesHint")} modalIcon={DocumentValidationIcon} size="lg">
      <PolicyForm types={typeOptions} />
    </ModalButton>
  );

  return (
    <div className="space-y-6">
      <Card icon={Calendar03Icon} title={t("types")} subtitle={tc("admin2.typesHint")} actions={newType}>
        {types.length === 0 ? (
          <EmptyState icon={Calendar03Icon} title={tc("admin2.noTypes")} />
        ) : (
          <ul className="-my-2 divide-y divide-line">
            {types.map((x) => (
              <li key={x.id} className="flex items-center gap-3 py-3">
                <TypeChip color={x.color} working={x.countsAsWorking} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-ink-2">
                    {localized(locale, x.nameUk, x.nameEn)} <span className="ml-1 font-mono text-[11px] font-normal text-ink-mute">{x.code}</span>
                  </p>
                  <p className="mt-1 flex flex-wrap gap-1">
                    {TYPE_FLAGS.filter(([k]) => x[k]).map(([k, label]) => (
                      <Badge key={k} tone={k === "paid" ? "ok" : k === "countsAsWorking" ? "warn" : "neutral"}>
                        {t(label)}
                      </Badge>
                    ))}
                    {(x.minDays != null || x.maxDays != null) && (
                      <Badge>
                        {[x.minDays != null && `${t("minDays")} ${x.minDays}`, x.maxDays != null && `${t("maxDays")} ${x.maxDays}`].filter(Boolean).join(" · ")}
                      </Badge>
                    )}
                  </p>
                </div>
                <ModalButton iconOnly icon={PencilEdit02Icon} label={tc("common.edit")} title={localized(locale, x.nameUk, x.nameEn)} modalIcon={Calendar03Icon} size="lg">
                  <AbsenceTypeForm type={x as AbsenceTypeDto} />
                </ModalButton>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card icon={DocumentValidationIcon} tone="blue" title={t("policies")} subtitle={t("policiesHint")} actions={newPolicy}>
        {policies.length === 0 ? (
          <EmptyState icon={DocumentValidationIcon} title={tc("admin2.noPolicies")} />
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {policies.map((p) => (
              <li key={p.id} className="flex gap-3 rounded-2xl border border-line p-4">
                <TypeChip color={p.absenceType.color} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-ink-mute">{localized(locale, p.absenceType.nameUk, p.absenceType.nameEn)}</p>
                  <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-ink-2">
                    {p.name}
                    {p.isDefault && <Badge tone="ok">{t("default")}</Badge>}
                  </p>
                  <p className="mt-2 flex flex-wrap gap-1">
                    <Badge tone="ink">{tc("admin2.daysPer", { n: p.daysPerPeriod })}</Badge>
                    <Badge>{t(`periodStarts.${p.periodStart}`)}</Badge>
                    <Badge>{t(`accruals.${p.accrual}`)}</Badge>
                    <Badge>
                      {t("expiry")}: {t(`expiries.${p.expiry}`)}
                    </Badge>
                    {p.availableAfterDays > 0 && <Badge tone="warn">{tc("admin2.afterDays", { n: p.availableAfterDays })}</Badge>}
                  </p>
                  {(p.companies.length > 0 || p.departments.length > 0 || p.employeeCount > 0) && (
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-mute">
                      <HugeiconsIcon icon={HierarchySquare01Icon} size={14} className="shrink-0" />
                      <span className="truncate">
                        {[...p.companies, ...p.departments].join(", ")}
                        {p.employeeCount > 0 && ` · ${p.employeeCount} ${t("employees")}`}
                      </span>
                    </p>
                  )}
                </div>
                <ModalButton iconOnly icon={PencilEdit02Icon} label={tc("common.edit")} title={p.name} modalIcon={DocumentValidationIcon} size="lg">
                  <PolicyForm policy={p as PolicyDto} types={typeOptions} />
                </ModalButton>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {gridTypes.length > 0 && (
        <Card icon={HierarchySquare01Icon} tone="ok" title={t("assignPolicy")} subtitle={t("assignHint")}>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th />
                  {gridTypes.map((x) => (
                    <th key={x.id}>
                      <span className="flex items-center gap-1.5">
                        <span className="size-2 rounded-full" style={{ backgroundColor: x.color }} aria-hidden />
                        {localized(locale, x.nameUk, x.nameEn)}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.targetType}:${r.id}`}>
                    <td className={r.targetType === "company" ? "font-bold text-ink-2" : "pl-7! text-ink-soft"}>{r.label}</td>
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
