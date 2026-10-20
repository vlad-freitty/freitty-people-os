import type { Actor } from "@/server/authz/actor";
import { can } from "@/server/authz/policy";
import { listEmployees } from "@/server/services/employees";
import { getOrgStructure } from "@/server/services/org";

/** Select options for the employee form; departments are limited to those the actor may assign people to. */
export async function employeeFormOptions(actor: Actor, currentDepartmentId?: string) {
  const [org, people] = await Promise.all([getOrgStructure(actor), listEmployees(actor)]);
  const companyName = new Map(org.companies.map((c) => [c.id, c.name]));
  return {
    departments: org.departments
      .filter((d) => d.id === currentDepartmentId || can(actor, "employees.edit", { departmentId: d.id }))
      .map((d) => ({ id: d.id, label: `${companyName.get(d.companyId)} · ${d.name}` })),
    locations: org.locations.map((l) => ({ id: l.id, label: `${l.name} (${l.timezone})` })),
    managers: people.map((p) => ({ id: p.id, label: `${p.lastName} ${p.firstName}` })),
  };
}
