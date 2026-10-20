import type { Prisma } from "@prisma/client";
import type { Actor } from "@/server/authz/actor";
import type { Tx } from "@/server/db";

type AuditEntry = {
  action: string;
  entity: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  departmentId?: string | null;
  employeeId?: string | null;
};

/** Writes an audit record inside the same transaction as the change itself. */
export async function audit(tx: Tx, actor: Actor | null, entry: AuditEntry) {
  await tx.auditLog.create({
    data: {
      actorId: actor?.userId ?? null,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      before: toJson(entry.before),
      after: toJson(entry.after),
      departmentId: entry.departmentId ?? null,
      employeeId: entry.employeeId ?? null,
    },
  });
}

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
