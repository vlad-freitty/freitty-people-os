import type { Prisma } from "@prisma/client";
import { z } from "zod";
import type { Actor } from "@/server/authz/actor";
import { can, scopeOf } from "@/server/authz/policy";
import { prisma } from "@/server/db";

const query = z.object({
  entity: z.string().optional(),
  entityId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  before: z.string().datetime().optional(),
});

/**
 * Audit log, scoped (PRD 2): all → everything; departments → entries about the actor's departments
 * plus their own actions; self → only the actor's own actions.
 */
export async function listAuditLog(actor: Actor, raw: unknown = {}) {
  const q = query.parse(raw);
  const scope = scopeOf(actor, "audit.view");
  if (!scope) return [];

  const visibility: Prisma.AuditLogWhereInput =
    scope === "all"
      ? {}
      : scope === "departments"
        ? { OR: [{ actorId: actor.userId }, { departmentId: { in: actor.headedDepartmentIds } }] }
        : { actorId: actor.userId };

  const rows = await prisma.auditLog.findMany({
    where: {
      AND: [
        visibility,
        q.entity ? { entity: q.entity } : {},
        q.entityId ? { entityId: q.entityId } : {},
        q.before ? { at: { lt: new Date(q.before) } } : {},
      ],
    },
    orderBy: { at: "desc" },
    take: q.limit,
  });

  const actorIds = [...new Set(rows.map((r) => r.actorId).filter((x): x is string => !!x))];
  const users = await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, email: true } });
  const emailById = new Map(users.map((u) => [u.id, u.email]));

  return rows.map((r) => {
    const redacted = !canSeePayload(actor, r);
    return {
      id: r.id,
      at: r.at.toISOString(),
      actor: r.actorId ? { id: r.actorId, email: emailById.get(r.actorId) ?? null } : null,
      action: r.action,
      entity: r.entity,
      entityId: r.entityId,
      redacted,
      before: redacted ? null : r.before,
      after: redacted ? null : r.after,
    };
  });
}

/** Seeing that something changed is not the same as seeing the values: payloads follow the data permissions. */
function canSeePayload(actor: Actor, r: { entity: string; employeeId: string | null; departmentId: string | null }) {
  if (!r.employeeId) return true;
  const target = { employeeId: r.employeeId, departmentId: r.departmentId };
  if (SENSITIVE_ENTITIES.has(r.entity)) return can(actor, "employees.view_sensitive", target);
  return can(actor, "employees.view", target);
}

const SENSITIVE_ENTITIES = new Set(["RateHistory"]);
