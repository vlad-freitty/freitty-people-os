import type { PermissionScope } from "@prisma/client";
import { z } from "zod";
import { audit } from "@/server/audit";
import type { Actor } from "@/server/authz/actor";
import { isPermission, isScopeAllowed, PERMISSIONS, SUPERADMIN_ROLE } from "@/server/authz/permissions";
import { assertGlobal, hasPermission } from "@/server/authz/policy";
import { prisma } from "@/server/db";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";

const permissionsInput = z.record(z.string(), z.enum(["all", "departments", "self"]));

const roleInput = z.object({
  code: z.string().regex(/^[a-z][a-z0-9_]{1,40}$/),
  nameUk: z.string().min(1).max(100),
  nameEn: z.string().max(100).optional().nullable(),
  permissions: permissionsInput,
});

function validatePermissions(input: Record<string, PermissionScope>) {
  const errors: string[] = [];
  for (const [key, scope] of Object.entries(input)) {
    if (!isPermission(key)) errors.push(`unknown permission: ${key}`);
    else if (!isScopeAllowed(key, scope)) errors.push(`scope ${scope} not allowed for ${key}`);
  }
  if (errors.length) throw new ValidationError(errors);
}

function toRoleDto(role: {
  id: string;
  code: string;
  nameUk: string;
  nameEn: string | null;
  isSystem: boolean;
  permissions: { permission: string; scope: PermissionScope }[];
  _count?: { users: number };
}) {
  return {
    id: role.id,
    code: role.code,
    nameUk: role.nameUk,
    nameEn: role.nameEn,
    isSystem: role.isSystem,
    locked: role.code === SUPERADMIN_ROLE,
    userCount: role._count?.users ?? 0,
    permissions: Object.fromEntries(
      role.code === SUPERADMIN_ROLE
        ? Object.keys(PERMISSIONS).map((p) => [p, "all" as PermissionScope])
        : role.permissions.map((p) => [p.permission, p.scope]),
    ),
  };
}

export type RoleDto = ReturnType<typeof toRoleDto>;

export async function listRoles(actor: Actor) {
  if (!hasPermission(actor, "roles.manage") && !hasPermission(actor, "roles.assign")) throw new ForbiddenError();
  const roles = await prisma.role.findMany({
    where: { deletedAt: null },
    include: { permissions: true, _count: { select: { users: { where: { deletedAt: null } } } } },
    orderBy: [{ isSystem: "desc" }, { code: "asc" }],
  });
  return roles.map(toRoleDto);
}

export async function createRole(actor: Actor, raw: unknown) {
  assertGlobal(actor, "roles.manage");
  const input = roleInput.parse(raw);
  validatePermissions(input.permissions);
  if (await prisma.role.findUnique({ where: { code: input.code } })) throw new ConflictError("role code exists");

  return prisma.$transaction(async (tx) => {
    const role = await tx.role.create({
      data: {
        code: input.code,
        nameUk: input.nameUk,
        nameEn: input.nameEn ?? null,
        createdById: actor.userId,
        permissions: { create: Object.entries(input.permissions).map(([permission, scope]) => ({ permission, scope })) },
      },
      include: { permissions: true },
    });
    const dto = toRoleDto(role);
    await audit(tx, actor, { action: "role.create", entity: "Role", entityId: role.id, after: dto });
    return dto;
  });
}

export async function updateRole(actor: Actor, roleId: string, raw: unknown) {
  assertGlobal(actor, "roles.manage");
  const input = roleInput.omit({ code: true }).partial().parse(raw);
  const role = await prisma.role.findFirst({ where: { id: roleId, deletedAt: null }, include: { permissions: true } });
  if (!role) throw new NotFoundError("role");
  if (role.code === SUPERADMIN_ROLE) throw new ForbiddenError("superadmin role is locked");
  if (input.permissions) validatePermissions(input.permissions);

  return prisma.$transaction(async (tx) => {
    const before = toRoleDto(role);
    if (input.permissions) {
      await tx.rolePermission.deleteMany({ where: { roleId } });
      await tx.rolePermission.createMany({
        data: Object.entries(input.permissions).map(([permission, scope]) => ({ roleId, permission, scope })),
      });
    }
    const updated = await tx.role.update({
      where: { id: roleId },
      data: { nameUk: input.nameUk ?? undefined, nameEn: input.nameEn === undefined ? undefined : input.nameEn },
      include: { permissions: true },
    });
    const after = toRoleDto(updated);
    await audit(tx, actor, { action: "role.update", entity: "Role", entityId: roleId, before, after });
    return after;
  });
}

export async function deleteRole(actor: Actor, roleId: string) {
  assertGlobal(actor, "roles.manage");
  const role = await prisma.role.findFirst({
    where: { id: roleId, deletedAt: null },
    include: { permissions: true, _count: { select: { users: { where: { deletedAt: null } } } } },
  });
  if (!role) throw new NotFoundError("role");
  if (role.isSystem) throw new ForbiddenError("system roles cannot be deleted");
  if (role._count.users > 0) throw new ConflictError("role has users");
  await prisma.$transaction(async (tx) => {
    await tx.role.update({ where: { id: roleId }, data: { deletedAt: new Date() } });
    await audit(tx, actor, { action: "role.delete", entity: "Role", entityId: roleId, before: toRoleDto(role) });
  });
}

export async function listUsers(actor: Actor) {
  assertGlobal(actor, "roles.assign");
  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    include: { role: true, employee: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: { email: "asc" },
  });
  return users.map((u) => ({
    id: u.id,
    email: u.email,
    isActive: u.isActive,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    role: { id: u.role.id, code: u.role.code, nameUk: u.role.nameUk, nameEn: u.role.nameEn },
    employee: u.employee ? { id: u.employee.id, name: `${u.employee.firstName} ${u.employee.lastName}` } : null,
  }));
}

/**
 * Assigns a role to a user. Guards:
 *  - only a superadmin can grant or take away the superadmin role;
 *  - the last active superadmin cannot be demoted (no lockout).
 */
export async function assignRole(actor: Actor, userId: string, roleId: string) {
  assertGlobal(actor, "roles.assign");
  const [user, role] = await Promise.all([
    prisma.user.findFirst({ where: { id: userId, deletedAt: null }, include: { role: true } }),
    prisma.role.findFirst({ where: { id: roleId, deletedAt: null } }),
  ]);
  if (!user) throw new NotFoundError("user");
  if (!role) throw new NotFoundError("role");
  if (user.roleId === role.id) return;

  const touchesSuperadmin = role.code === SUPERADMIN_ROLE || user.role.code === SUPERADMIN_ROLE;
  if (touchesSuperadmin && !actor.isSuperadmin) throw new ForbiddenError("only superadmin manages superadmins");
  if (user.role.code === SUPERADMIN_ROLE) {
    const remaining = await prisma.user.count({
      where: { role: { code: SUPERADMIN_ROLE }, isActive: true, deletedAt: null, id: { not: userId } },
    });
    if (remaining === 0) throw new ConflictError("cannot demote the last superadmin");
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { roleId } });
    await audit(tx, actor, {
      action: "user.role.assign",
      entity: "User",
      entityId: userId,
      before: { role: user.role.code },
      after: { role: role.code },
    });
  });
}
