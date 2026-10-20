import type { Actor } from "@/server/authz/actor";
import { employeeScopeWhere, scopeOf } from "@/server/authz/policy";
import { requestWhere } from "./requests";
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

/** Requests of the actor's departments grouped by status (PRD 7, department head). */
export async function requestsByStatus(actor: Actor) {
  const scope = scopeOf(actor, "requests.view");
  if (scope !== "all" && scope !== "departments") return null;
  const rows = await prisma.request.groupBy({ by: ["status"], where: { AND: [requestWhere(actor), { parentStepId: null }] }, _count: true });
  return Object.fromEntries(rows.map((r) => [r.status, r._count])) as Partial<Record<string, number>>;
}

/** Documents of people in scope whose validity ends within `days` (PRD 7). */
export async function expiringDocuments(actor: Actor, days = 30, now = new Date()) {
  const scope = scopeOf(actor, "employees.view_sensitive");
  if (scope !== "all" && scope !== "departments") return null;
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const rows = await prisma.document.findMany({
    where: {
      deletedAt: null,
      status: "active",
      validTo: { gte: today, lte: new Date(today.getTime() + days * 86_400_000) },
      employee: { ...employeeScopeWhere(actor, "employees.view_sensitive")!, deletedAt: null },
    },
    include: { employee: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: { validTo: "asc" },
    take: 30,
  });
  return rows.map((d) => ({
    id: d.id,
    type: d.type,
    fileName: d.fileName,
    validTo: d.validTo!.toISOString().slice(0, 10),
    employee: { id: d.employee.id, name: `${d.employee.firstName} ${d.employee.lastName}` },
  }));
}

/** Headcount by department within the actor's scope. */
export async function headcountByDepartment(actor: Actor) {
  const scope = scopeOf(actor, "employees.view");
  if (scope !== "all" && scope !== "departments") return null;
  const where = { deletedAt: null, status: { notIn: ["left" as const, "candidate" as const] }, ...employeeScopeWhere(actor, "employees.view")! };
  const [groups, departments] = await Promise.all([
    prisma.employee.groupBy({ by: ["departmentId"], where, _count: true }),
    prisma.department.findMany({ where: { deletedAt: null }, select: { id: true, name: true, company: { select: { name: true } } } }),
  ]);
  return groups
    .map((g) => {
      const d = departments.find((x) => x.id === g.departmentId);
      return { id: g.departmentId, name: d?.name ?? "—", company: d?.company.name ?? "", count: g._count };
    })
    .sort((a, b) => a.company.localeCompare(b.company) || b.count - a.count);
}

/** Payments of periods that are not closed, by status, with totals per currency (finance). */
export async function paymentsByStatus(actor: Actor) {
  if (scopeOf(actor, "payments.manage") !== "all") return null;
  const rows = await prisma.payment.groupBy({
    by: ["status", "currency"],
    where: { period: { status: { not: "locked" } } },
    _count: true,
    _sum: { total: true },
  });
  return rows.map((r) => ({ status: r.status, currency: r.currency, count: r._count, total: Number(r._sum.total ?? 0).toFixed(2) }));
}
