import type { Actor } from "@/server/authz/actor";
import { employeeScopeWhere, scopeOf } from "@/server/authz/policy";
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

const MILESTONES = [30, 60, 90] as const;
const DAY = 86_400_000;

/**
 * Probation reminders (PRD 1, phase 1): people in the actor's employees.view scope whose day 30 / 60 / 90
 * since hire falls between 3 days ago and 14 days ahead.
 */
export async function probationMilestones(actor: Actor, now = new Date()) {
  const scope = employeeScopeWhere(actor, "employees.view");
  if (!scope || scopeOf(actor, "employees.view") === "self") return [];
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const rows = await prisma.employee.findMany({
    where: {
      ...scope,
      deletedAt: null,
      status: { in: ["onboarding", "active"] },
      hireDate: { gte: new Date(today - 105 * DAY), lte: new Date(today + 14 * DAY) },
    },
    select: { id: true, firstName: true, lastName: true, hireDate: true, department: { select: { name: true } } },
  });
  return rows
    .flatMap((e) =>
      MILESTONES.map((day) => ({ e, day, date: e.hireDate!.getTime() + day * DAY })).filter(({ date }) => date >= today - 3 * DAY && date <= today + 14 * DAY),
    )
    .sort((a, b) => a.date - b.date)
    .map(({ e, day, date }) => ({
      employeeId: e.id,
      name: `${e.firstName} ${e.lastName}`,
      department: e.department.name,
      day,
      date: new Date(date).toISOString().slice(0, 10),
    }));
}
