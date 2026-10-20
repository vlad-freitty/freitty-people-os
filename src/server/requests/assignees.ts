import type { AssigneeRule } from "@prisma/client";
import type { Tx } from "@/server/db";

/**
 * Assignee resolution (PRD 4). Returns an employee id, or null → the step gets status needs_assignment
 * and shows up on the superadmin dashboard. When several people qualify, the one with the fewest
 * active steps wins (ties broken by name) — the "first free" interpretation used for every rule.
 */

type Ctx = {
  initiatorId: string;
  subjectEmployeeId: string | null;
  /** department the request is about (subject's, or the department field of a hiring request) */
  subjectDepartmentId: string | null;
  systemOwnerId?: string | null;
};

const ACTIVE_PERSON = { deletedAt: null, status: { not: "left" as const } };

export async function resolveAssignee(tx: Tx, rule: AssigneeRule, value: string | null, ctx: Ctx): Promise<string | null> {
  switch (rule) {
    case "person": {
      if (!value) return null;
      const e = await tx.employee.findFirst({ where: { id: value, ...ACTIVE_PERSON }, select: { id: true } });
      return e?.id ?? null;
    }
    case "initiator":
      return ctx.initiatorId;
    case "initiator_dept_head": {
      const initiator = await tx.employee.findUnique({ where: { id: ctx.initiatorId }, select: { departmentId: true } });
      return initiator ? nearestHead(tx, initiator.departmentId, ctx.initiatorId) : null;
    }
    case "subject_dept_head":
      return ctx.subjectDepartmentId ? nearestHead(tx, ctx.subjectDepartmentId, ctx.subjectEmployeeId) : null;
    case "system_owner": {
      if (!ctx.systemOwnerId) return null;
      const e = await tx.employee.findFirst({ where: { id: ctx.systemOwnerId, ...ACTIVE_PERSON }, select: { id: true } });
      return e?.id ?? null;
    }
    case "role_first_free": {
      if (!value) return null;
      const people = await tx.employee.findMany({
        where: { ...ACTIVE_PERSON, user: { isActive: true, deletedAt: null, role: { code: value } } },
        select: { id: true },
      });
      return leastLoaded(tx, people.map((p) => p.id));
    }
  }
}

/**
 * Head of the department; if it has none, the head of the closest parent department.
 * A head never approves their own request: for a person who heads the department we go one level up.
 */
async function nearestHead(tx: Tx, departmentId: string, exceptId: string | null): Promise<string | null> {
  let current: string | null = departmentId;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current);
    const dept: { parentId: string | null; heads: { employeeId: string }[] } | null = await tx.department.findUnique({
      where: { id: current },
      select: { parentId: true, heads: { where: { employee: ACTIVE_PERSON }, select: { employeeId: true } } },
    });
    if (!dept) return null;
    const heads = dept.heads.map((h) => h.employeeId).filter((id) => id !== exceptId);
    if (heads.length) return leastLoaded(tx, heads);
    current = dept.parentId;
  }
  return null;
}

async function leastLoaded(tx: Tx, ids: string[]): Promise<string | null> {
  if (ids.length === 0) return null;
  if (ids.length === 1) return ids[0];
  const [loads, people] = await Promise.all([
    tx.stepInstance.groupBy({ by: ["assigneeId"], where: { assigneeId: { in: ids }, status: "active" }, _count: true }),
    tx.employee.findMany({ where: { id: { in: ids } }, select: { id: true, lastName: true, firstName: true } }),
  ]);
  const load = new Map(loads.map((l) => [l.assigneeId, l._count]));
  people.sort((a, b) => (load.get(a.id) ?? 0) - (load.get(b.id) ?? 0) || a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
  return people[0]?.id ?? null;
}
