import { cookies } from "next/headers";
import { z } from "zod";
import type { Actor } from "@/server/authz/actor";
import { prisma } from "@/server/db";

export async function getMe(actor: Actor) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: actor.userId },
    include: { role: true, employee: { select: { id: true, firstName: true, lastName: true, photo: true, locale: true } } },
  });
  return {
    userId: user.id,
    email: user.email,
    role: { code: user.role.code, nameUk: user.role.nameUk, nameEn: user.role.nameEn },
    isSuperadmin: actor.isSuperadmin,
    employee: user.employee
      ? { id: user.employee.id, name: `${user.employee.firstName} ${user.employee.lastName}`, photo: user.employee.photo }
      : null,
    locale: user.employee?.locale ?? null,
    headedDepartmentIds: actor.headedDepartmentIds,
    permissions: Object.fromEntries(actor.permissions),
  };
}

export const LOCALE_COOKIE = "NEXT_LOCALE";

/** Saves the UA/EN choice in the profile (PRD 7) and in a cookie for users without a profile. */
export async function setMyLocale(actor: Actor, raw: unknown) {
  const locale = z.enum(["uk", "en"]).parse(raw);
  if (actor.employeeId) {
    await prisma.employee.update({ where: { id: actor.employeeId }, data: { locale } });
  }
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  return { locale };
}

export async function getProfileLocale(actor: Actor) {
  if (!actor.employeeId) return null;
  const e = await prisma.employee.findUnique({ where: { id: actor.employeeId }, select: { locale: true } });
  return e?.locale ?? null;
}
