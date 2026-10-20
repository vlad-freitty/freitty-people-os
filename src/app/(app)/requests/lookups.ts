import type { Actor } from "@/server/authz/actor";
import { listEmployees } from "@/server/services/employees";
import { getOrgStructure } from "@/server/services/org";
import { listSystems } from "@/server/services/systems";

/** Options for request form fields: people the actor can see, active systems, departments. */
export async function requestLookups(actor: Actor) {
  const [people, systems, org] = await Promise.all([listEmployees(actor), listSystems(actor), getOrgStructure(actor)]);
  const companyName = new Map(org.companies.map((c) => [c.id, c.name]));
  return {
    people: people.filter((p) => p.access === "basic" || p.status !== "left").map((p) => ({ id: p.id, label: `${p.lastName} ${p.firstName} · ${p.department.name}` })),
    systems: systems.filter((s) => s.isActive).map((s) => ({ id: s.id, name: s.name })),
    departments: org.departments.map((d) => ({ id: d.id, label: `${companyName.get(d.companyId)} · ${d.name}` })),
  };
}
