import { SUPERADMIN_ROLE } from "@/server/authz/permissions";
import { prisma } from "@/server/db";

type SignInInput = { email: string; provider: "entra" | "dev"; entraOid?: string };
type SignInResult = { ok: true; userId: string } | { ok: false; reason: "not_registered" | "inactive" };

/**
 * Who may sign in:
 *  - an existing active User;
 *  - an Employee whose work_email matches (User is created with the default "user" role);
 *  - SUPERADMIN_EMAIL from env (first superadmin, PRD 2).
 * Anyone else is rejected — accounts are never created for unknown emails.
 */
export async function resolveSignIn(input: SignInInput): Promise<SignInResult> {
  const email = input.email.trim().toLowerCase();
  if (!email) return { ok: false, reason: "not_registered" };

  let user = await prisma.user.findFirst({
    where: { deletedAt: null, OR: [{ email }, ...(input.entraOid ? [{ entraOid: input.entraOid }] : [])] },
  });

  if (!user) {
    // dev login only accepts users that already exist (seeded)
    if (input.provider === "dev") return { ok: false, reason: "not_registered" };
    const isFirstSuperadmin = email === process.env.SUPERADMIN_EMAIL?.trim().toLowerCase();
    const employee = await prisma.employee.findFirst({ where: { workEmail: email, deletedAt: null, userId: null } });
    if (!employee && !isFirstSuperadmin) return { ok: false, reason: "not_registered" };
    if (employee?.status === "left") return { ok: false, reason: "inactive" };
    const role = await prisma.role.findUniqueOrThrow({ where: { code: isFirstSuperadmin ? SUPERADMIN_ROLE : "user" } });
    user = await prisma.user.create({
      data: { email, entraOid: input.entraOid, roleId: role.id, employee: employee ? { connect: { id: employee.id } } : undefined },
    });
  }

  if (!user.isActive) return { ok: false, reason: "inactive" };

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date(), ...(input.entraOid && !user.entraOid ? { entraOid: input.entraOid } : {}) },
  });
  return { ok: true, userId: user.id };
}
