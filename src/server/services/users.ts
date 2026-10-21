import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { toIsoDate } from "@/lib/dates";
import { audit } from "@/server/audit";
import { generatePassword, hashPassword, passwordProblem, verifyPassword } from "@/server/auth/password";
import type { Actor } from "@/server/authz/actor";
import { SUPERADMIN_ROLE } from "@/server/authz/permissions";
import { assertGlobal } from "@/server/authz/policy";
import { prisma } from "@/server/db";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { employeeInput, resolveRefs, toData } from "./employees";

/**
 * Accounts (phase 7): the admin or HR (users.manage) issues an account together with the employee card and a
 * one-time password shown once; the person must change it at the first sign-in. Passwords never reach the audit log.
 */

export async function listAccounts(actor: Actor) {
  assertGlobal(actor, "users.manage");
  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    include: {
      role: { select: { id: true, code: true, nameUk: true, nameEn: true } },
      employee: { select: { id: true, firstName: true, lastName: true, position: true, department: { select: { name: true } } } },
    },
    orderBy: [{ isActive: "desc" }, { email: "asc" }],
  });
  const now = new Date();
  return users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.employee ? `${u.employee.firstName} ${u.employee.lastName}` : u.displayName,
    employeeId: u.employee?.id ?? null,
    position: u.employee?.position ?? null,
    department: u.employee?.department.name ?? null,
    role: u.role,
    isActive: u.isActive,
    hasPassword: !!u.passwordHash,
    mustChangePassword: u.mustChangePassword,
    locked: !!u.lockedUntil && u.lockedUntil > now,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
  }));
}

/** Only a superadmin touches superadmin accounts (same guard as role assignment, decision 5). */
function assertCanManage(actor: Actor, target: { roleCode: string }) {
  if (target.roleCode === SUPERADMIN_ROLE && !actor.isSuperadmin) throw new ForbiddenError("only superadmin manages superadmins");
}

const accessInput = employeeInput
  .pick({ firstName: true, lastName: true, workEmail: true, departmentId: true, position: true, employmentType: true, managerId: true, grade: true, locationId: true })
  .extend({ roleId: z.string().uuid(), hireDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

/**
 * "Новий доступ": employee card + account + one-time password. An existing card with this work email and no account
 * gets the account linked instead (its data is kept).
 */
export async function createAccess(actor: Actor, raw: unknown) {
  assertGlobal(actor, "users.manage");
  const input = accessInput.parse(raw);
  const role = await prisma.role.findFirst({ where: { id: input.roleId, deletedAt: null } });
  if (!role) throw new ValidationError({ roleId: "not_found" });
  assertCanManage(actor, { roleCode: role.code });
  if (await prisma.user.findFirst({ where: { email: input.workEmail } })) throw new ConflictError("account exists");
  const existing = await prisma.employee.findFirst({ where: { workEmail: input.workEmail, deletedAt: null } });
  if (existing?.userId) throw new ConflictError("account exists");
  const { companyId } = existing ? { companyId: existing.companyId } : await resolveRefs(input);

  const password = generatePassword();
  const passwordHash = await hashPassword(password);
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { email: input.workEmail, roleId: role.id, passwordHash, mustChangePassword: true, passwordChangedAt: new Date(), createdById: actor.userId },
    });
    const today = new Date().toISOString().slice(0, 10);
    const employee = existing
      ? await tx.employee.update({ where: { id: existing.id }, data: { userId: user.id } })
      : await tx.employee.create({
          data: {
            ...toData({ ...input, status: input.hireDate > today ? "onboarding" : "active" }),
            companyId: companyId!,
            userId: user.id,
            createdById: actor.userId,
          } as Prisma.EmployeeUncheckedCreateInput,
        });
    if (!existing) {
      await audit(tx, actor, {
        action: "employee.create",
        entity: "Employee",
        entityId: employee.id,
        after: { name: `${employee.firstName} ${employee.lastName}`, workEmail: employee.workEmail, position: employee.position, hireDate: toIsoDate(employee.hireDate) },
        departmentId: employee.departmentId,
        employeeId: employee.id,
      });
    }
    await audit(tx, actor, {
      action: "user.create",
      entity: "User",
      entityId: user.id,
      after: { email: user.email, role: role.code, linkedExistingCard: !!existing },
      departmentId: employee.departmentId,
      employeeId: employee.id,
    });
    return { userId: user.id, employeeId: employee.id, password };
  });
}

async function loadTarget(userId: string) {
  const user = await prisma.user.findFirst({ where: { id: userId, deletedAt: null }, include: { role: true, employee: { select: { id: true, departmentId: true } } } });
  if (!user) throw new NotFoundError("user");
  return user;
}

/** New one-time password; the old one and every open session stop working. */
export async function resetPassword(actor: Actor, userId: string) {
  assertGlobal(actor, "users.manage");
  const user = await loadTarget(userId);
  assertCanManage(actor, { roleCode: user.role.code });
  if (user.id === actor.userId) throw new ValidationError({ user: "use_change_password" });
  const password = generatePassword();
  const passwordHash = await hashPassword(password);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { passwordHash, mustChangePassword: true, passwordChangedAt: new Date(), failedLoginCount: 0, lockedUntil: null, sessionVersion: { increment: 1 } },
    });
    await audit(tx, actor, { action: "user.password.reset", entity: "User", entityId: user.id, departmentId: user.employee?.departmentId, employeeId: user.employee?.id });
  });
  return { password };
}

/** Deactivate (ends every session) or activate an account. Never yourself, never the last active superadmin. */
export async function setAccountActive(actor: Actor, userId: string, raw: unknown) {
  assertGlobal(actor, "users.manage");
  const { active } = z.object({ active: z.boolean() }).parse(raw);
  const user = await loadTarget(userId);
  assertCanManage(actor, { roleCode: user.role.code });
  if (user.id === actor.userId) throw new ValidationError({ user: "not_yourself" });
  if (user.isActive === active) return;
  if (!active && user.role.code === SUPERADMIN_ROLE) {
    const others = await prisma.user.count({ where: { role: { code: SUPERADMIN_ROLE }, isActive: true, deletedAt: null, id: { not: user.id } } });
    if (others === 0) throw new ConflictError("cannot deactivate the last superadmin");
  }
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { isActive: active, ...(active ? {} : { sessionVersion: { increment: 1 } }) } });
    await audit(tx, actor, {
      action: active ? "user.activate" : "user.deactivate",
      entity: "User",
      entityId: user.id,
      before: { isActive: user.isActive },
      after: { isActive: active },
      departmentId: user.employee?.departmentId,
      employeeId: user.employee?.id,
    });
  });
}

const changeInput = z.object({ current: z.string().max(200), next: z.string().min(1).max(200) });

/** The person changes their own password (always after a one-time one). Other sessions end. */
export async function changeOwnPassword(actor: Actor, raw: unknown) {
  const input = changeInput.parse(raw);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: actor.userId } });
  // an account without a password yet (dev login, older accounts) sets its first one; otherwise the current one is required
  if (user.passwordHash && !(await verifyPassword(input.current, user.passwordHash))) throw new ValidationError({ current: "wrong_password" });
  if (input.next === input.current) throw new ValidationError({ next: "same_as_current" });
  const problem = passwordProblem(input.next, user.email);
  if (problem) throw new ValidationError({ next: problem });
  const passwordHash = await hashPassword(input.next);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { passwordHash, mustChangePassword: false, passwordChangedAt: new Date(), sessionVersion: { increment: 1 } },
    });
    await audit(tx, actor, { action: "user.password.change", entity: "User", entityId: user.id, employeeId: actor.employeeId });
  });
  return { email: user.email };
}

/** For the first admin (`npm run admin:create`) — no actor: runs on the server only. */
export async function bootstrapSuperadmin(input: { email: string; name?: string; reset?: boolean; force?: boolean }) {
  const email = input.email.trim().toLowerCase();
  if (!z.string().email().safeParse(email).success) throw new ValidationError({ email: "invalid" });
  const role = await prisma.role.findUniqueOrThrow({ where: { code: SUPERADMIN_ROLE } });
  const existing = await prisma.user.findFirst({ where: { email } });
  const password = generatePassword();
  const passwordHash = await hashPassword(password);
  const secret = { passwordHash, mustChangePassword: true, passwordChangedAt: new Date(), failedLoginCount: 0, lockedUntil: null };
  if (input.reset) {
    if (!existing || existing.roleId !== role.id) throw new NotFoundError("superadmin with this email");
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: existing.id }, data: { ...secret, isActive: true, sessionVersion: { increment: 1 } } });
      await audit(tx, null, { action: "user.password.reset", entity: "User", entityId: existing.id, after: { via: "admin:create --reset" } });
    });
    return { password, created: false };
  }
  if (existing) throw new ConflictError("account exists — use --reset");
  const admins = await prisma.user.count({ where: { roleId: role.id, isActive: true, deletedAt: null } });
  if (admins > 0 && !input.force) throw new ConflictError("a superadmin already exists — use --force to add another one");
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { email, roleId: role.id, displayName: input.name?.trim() || null, ...secret } });
    // an employee card with this email gets linked (the first admin may already be in the imported staff list)
    await tx.employee.updateMany({ where: { workEmail: email, userId: null, deletedAt: null }, data: { userId: user.id } });
    await audit(tx, null, { action: "user.create", entity: "User", entityId: user.id, after: { email, role: SUPERADMIN_ROLE, via: "admin:create" } });
  });
  return { password, created: true };
}

/** Select options for the "new access" form: roles (superadmin only for a superadmin), departments, locations, people. */
export async function accessFormOptions(actor: Actor) {
  assertGlobal(actor, "users.manage");
  const [roles, departments, locations, people] = await Promise.all([
    prisma.role.findMany({ where: { deletedAt: null, ...(actor.isSuperadmin ? {} : { code: { not: SUPERADMIN_ROLE } }) }, orderBy: [{ isSystem: "desc" }, { nameUk: "asc" }] }),
    prisma.department.findMany({ where: { deletedAt: null }, include: { company: { select: { name: true } } }, orderBy: [{ company: { name: "asc" } }, { name: "asc" }] }),
    prisma.location.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }),
    prisma.employee.findMany({ where: { deletedAt: null, status: { not: "left" } }, select: { id: true, firstName: true, lastName: true }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] }),
  ]);
  return {
    roles: roles.map((r) => ({ id: r.id, code: r.code, nameUk: r.nameUk, nameEn: r.nameEn })),
    departments: departments.map((d) => ({ id: d.id, label: `${d.company.name} · ${d.name}` })),
    locations: locations.map((l) => ({ id: l.id, label: `${l.name} (${l.timezone})` })),
    managers: people.map((p) => ({ id: p.id, label: `${p.lastName} ${p.firstName}` })),
  };
}
