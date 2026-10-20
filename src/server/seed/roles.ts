import type { PrismaClient } from "@prisma/client";
import { DEFAULT_ROLE_PERMISSIONS, SUPERADMIN_ROLE } from "@/server/authz/permissions";

const SYSTEM_ROLES = [
  { code: SUPERADMIN_ROLE, nameUk: "Суперадмін", nameEn: "Superadmin" },
  { code: "ceo", nameUk: "CEO", nameEn: "CEO" },
  { code: "dept_head", nameUk: "Керівник відділу", nameEn: "Department head" },
  { code: "user", nameUk: "Користувач", nameEn: "User" },
];

/**
 * Creates the four system roles if missing. Permissions are written only for newly created roles,
 * so changes the superadmin made in the UI are never overwritten by a re-seed or a deploy.
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
