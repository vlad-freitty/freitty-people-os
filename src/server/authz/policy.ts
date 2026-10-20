import type { Prisma } from "@prisma/client";
import { ForbiddenError } from "@/server/errors";
import type { Actor } from "./actor";
import type { Permission } from "./permissions";

/** Minimal shape of a record the scope check needs. */
export type ScopedTarget = { employeeId?: string | null; departmentId?: string | null };

export function scopeOf(actor: Actor, permission: Permission) {
  return actor.permissions.get(permission) ?? null;
}

export function hasPermission(actor: Actor, permission: Permission): boolean {
  return actor.permissions.has(permission);
}

/** Does the actor hold `permission` for this particular record? Scopes nest: all ⊃ departments ⊃ self. */
export function can(actor: Actor, permission: Permission, target: ScopedTarget): boolean {
  const scope = scopeOf(actor, permission);
  if (!scope) return false;
  if (scope === "all") return true;
  const isSelf = !!actor.employeeId && target.employeeId === actor.employeeId;
  if (isSelf) return true;
  if (scope === "departments") {
    return !!target.departmentId && actor.headedDepartmentIds.includes(target.departmentId);
  }
  return false;
}

export function assertCan(actor: Actor, permission: Permission, target: ScopedTarget) {
  if (!can(actor, permission, target)) throw new ForbiddenError(permission);
}

/** For global (non-record) permissions such as org.manage or roles.manage. */
export function assertGlobal(actor: Actor, permission: Permission) {
  if (scopeOf(actor, permission) !== "all") throw new ForbiddenError(permission);
}

/** Prisma filter selecting employees within the actor's scope for `permission`; null = no access at all. */
export function employeeScopeWhere(actor: Actor, permission: Permission): Prisma.EmployeeWhereInput | null {
  const scope = scopeOf(actor, permission);
  if (!scope) return null;
  if (scope === "all") return {};
  const self: Prisma.EmployeeWhereInput[] = actor.employeeId ? [{ id: actor.employeeId }] : [];
  if (scope === "departments") {
    return { OR: [...self, { departmentId: { in: actor.headedDepartmentIds } }] };
  }
  return self.length ? self[0] : { id: { in: [] } };
}
