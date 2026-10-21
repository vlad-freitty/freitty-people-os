import type { PermissionScope } from "@prisma/client";
import { prisma } from "@/server/db";
import { UnauthorizedError } from "@/server/errors";
import { isPermission, PERMISSION_KEYS, SUPERADMIN_ROLE, type Permission } from "./permissions";

/** Who is making the request. Built once per request from the session; every service takes it as first argument. */
export type Actor = {
  userId: string;
  email: string;
  roleCode: string;
  isSuperadmin: boolean;
  employeeId: string | null;
  /** departments the actor heads, including all sub-departments */
  headedDepartmentIds: string[];
  permissions: Map<Permission, PermissionScope>;
  /** a one-time password is still in use: every page and API call except changing it is refused (phase 7) */
  mustChangePassword: boolean;
};

/** sessionVersion: from the session token — a mismatch means the password was reset or the account deactivated since. */
export async function loadActor(userId: string, sessionVersion?: number): Promise<Actor> {
  const user = await prisma.user.findFirst({
    where: { id: userId, isActive: true, deletedAt: null },
    include: {
      role: { include: { permissions: true } },
      employee: { select: { id: true, deletedAt: true, headOf: { select: { departmentId: true } } } },
    },
  });
  if (!user || user.role.deletedAt) throw new UnauthorizedError();
  if (sessionVersion !== undefined && sessionVersion !== user.sessionVersion) throw new UnauthorizedError();

  const isSuperadmin = user.role.code === SUPERADMIN_ROLE;
  const permissions = new Map<Permission, PermissionScope>();
  if (isSuperadmin) {
    for (const p of PERMISSION_KEYS) permissions.set(p, "all");
  } else {
    for (const rp of user.role.permissions) {
      if (isPermission(rp.permission)) permissions.set(rp.permission, rp.scope);
    }
  }

  const employee = user.employee && !user.employee.deletedAt ? user.employee : null;
  const directHeads = employee?.headOf.map((h) => h.departmentId) ?? [];

  return {
    userId: user.id,
    email: user.email,
    roleCode: user.role.code,
    isSuperadmin,
    employeeId: employee?.id ?? null,
    headedDepartmentIds: await withDescendants(directHeads),
    permissions,
    mustChangePassword: user.mustChangePassword,
  };
}

/** Expands department ids with all their (non-deleted) descendants. */
export async function withDescendants(rootIds: string[]): Promise<string[]> {
  if (rootIds.length === 0) return [];
  const all = await prisma.department.findMany({
    where: { deletedAt: null },
    select: { id: true, parentId: true },
  });
  const children = new Map<string, string[]>();
  for (const d of all) {
    if (!d.parentId) continue;
    children.set(d.parentId, [...(children.get(d.parentId) ?? []), d.id]);
  }
  const result = new Set<string>();
  const queue = [...rootIds];
  while (queue.length) {
    const id = queue.pop()!;
    if (result.has(id)) continue;
    result.add(id);
    queue.push(...(children.get(id) ?? []));
  }
  return [...result];
}
