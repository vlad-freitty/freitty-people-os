import { devLoginEnabled } from "@/auth";
import { prisma } from "@/server/db";

/** Seeded users for the dev login picker. Returns nothing unless dev login is enabled. */
export async function listDevLoginUsers() {
  if (!devLoginEnabled) return [];
  const users = await prisma.user.findMany({
    where: { deletedAt: null, isActive: true },
    include: { role: true, employee: { select: { firstName: true, lastName: true, position: true } } },
    orderBy: [{ role: { code: "asc" } }, { email: "asc" }],
  });
  return users.map((u) => ({
    email: u.email,
    name: u.employee ? `${u.employee.firstName} ${u.employee.lastName}` : u.email,
    position: u.employee?.position ?? null,
    role: { code: u.role.code, nameUk: u.role.nameUk, nameEn: u.role.nameEn },
  }));
}
