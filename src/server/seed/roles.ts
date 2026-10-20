import type { PrismaClient } from "@prisma/client";
import { DEFAULT_ROLE_PERMISSIONS, SYSTEM_ROLES } from "@/server/authz/permissions";

/**
 * Creates missing system roles (tests and fresh dev databases). Permissions are written only for newly created
 * roles, so changes the superadmin made in the UI are never overwritten. Production databases get the same roles
 * from the SQL data migrations.
 */
export async function ensureSystemRoles(prisma: PrismaClient) {
  for (const r of SYSTEM_ROLES) {
    const existing = await prisma.role.findUnique({ where: { code: r.code } });
    if (existing) continue;
    const perms = Object.entries(DEFAULT_ROLE_PERMISSIONS[r.code] ?? {});
    await prisma.role.create({
      data: { ...r, isSystem: true, permissions: { create: perms.map(([permission, scope]) => ({ permission, scope: scope! })) } },
    });
  }
  return Object.fromEntries((await prisma.role.findMany()).map((r) => [r.code, r.id])) as Record<string, string>;
}
