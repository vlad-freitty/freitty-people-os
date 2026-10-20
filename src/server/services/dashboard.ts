import type { Actor } from "@/server/authz/actor";
import { employeeScopeWhere } from "@/server/authz/policy";
import { prisma } from "@/server/db";

/** Phase 0 dashboard: headcount within the actor's scope. Full dashboards arrive in phase 4. */
export async function getDashboard(actor: Actor) {
  const scope = employeeScopeWhere(actor, "employees.view");
  const where = { deletedAt: null, status: { not: "left" as const }, ...(scope ?? { id: { in: [] } }) };
  const [headcount, byCompany, departments, companies] = await Promise.all([
    prisma.employee.count({ where }),
    prisma.employee.groupBy({ by: ["companyId"], where, _count: true }),
    prisma.department.count({ where: { deletedAt: null } }),
    prisma.company.findMany({ where: { deletedAt: null }, select: { id: true, name: true } }),
  ]);
  return {
    headcount,
    departments,
    companies: companies.length,
    byCompany: companies.map((c) => ({ ...c, count: byCompany.find((b) => b.companyId === c.id)?._count ?? 0 })),
  };
}
