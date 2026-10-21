/** Phase 7 acceptance: email + password sign-in, accounts issued by an admin, one-time passwords (docs/phase-7-plan.md). */
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { ConflictError, ForbiddenError, UnauthorizedError, ValidationError } from "@/server/errors";
import { generatePassword, hashPassword, verifyPassword } from "@/server/auth/password";
import { passwordSignIn } from "@/server/auth/sign-in";
import { loadActor } from "@/server/authz/actor";
import { bootstrapSuperadmin, changeOwnPassword, createAccess, resetPassword, setAccountActive } from "@/server/services/users";
import { actorFor, buildWorld } from "./helpers";

type World = Awaited<ReturnType<typeof buildWorld>>;
let w: World;

beforeEach(async () => {
  w = await buildWorld();
});

const newAccess = (over: Record<string, unknown> = {}) => ({
  workEmail: "new.person@example.test",
  firstName: "Нова",
  lastName: "Людина",
  roleId: w.roles.user,
  departmentId: w.departments.cs.id,
  position: "Оператор",
  employmentType: "employee",
  hireDate: "2026-10-01",
  grade: "individual_contributor",
  ...over,
});

describe("passwords", () => {
  it("hash round-trip; generated one-time passwords have every character class", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
    expect(await verifyPassword("anything", null)).toBe(false);
    for (let i = 0; i < 20; i++) {
      const p = generatePassword();
      expect(p).toHaveLength(16);
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/[2-9]/);
      expect(p).toMatch(/[-_]/);
      expect(p).not.toMatch(/[01OlI]/);
    }
  });
});

describe("issuing access", () => {
  it("creates the employee card and the account; the one-time password must be changed first", async () => {
    const S = await actorFor(w.people.S);
    const { password, employeeId, userId } = await createAccess(S, newAccess());
    const e = await prisma.employee.findUniqueOrThrow({ where: { id: employeeId } });
    expect(e).toMatchObject({ firstName: "Нова", position: "Оператор", grade: "individual_contributor", companyId: w.companies.a.id, userId, status: "active" });

    const signIn = await passwordSignIn("New.Person@example.test", password);
    expect(signIn.ok).toBe(true);
    const actor = await loadActor(userId, 0);
    expect(actor.mustChangePassword).toBe(true);

    await expect(changeOwnPassword(actor, { current: password, next: "short" })).rejects.toBeInstanceOf(ValidationError);
    await expect(changeOwnPassword(actor, { current: "wrong-password!", next: "a much better passphrase" })).rejects.toBeInstanceOf(ValidationError);
    await changeOwnPassword(actor, { current: password, next: "a much better passphrase" });

    await expect(loadActor(userId, 0)).rejects.toBeInstanceOf(UnauthorizedError); // the old session ended
    const fresh = await loadActor(userId, 1);
    expect(fresh.mustChangePassword).toBe(false);
    expect((await passwordSignIn("new.person@example.test", password)).ok).toBe(false);
    expect((await passwordSignIn("new.person@example.test", "a much better passphrase")).ok).toBe(true);
    // the password never reaches the audit log
    const logs = await prisma.auditLog.findMany({ where: { entityId: userId } });
    expect(JSON.stringify(logs)).not.toContain(password);
  });

  it("a future start date makes the card 'onboarding'; an existing card without an account is linked", async () => {
    const S = await actorFor(w.people.S);
    const { employeeId } = await createAccess(S, newAccess({ hireDate: "2099-01-01" }));
    expect((await prisma.employee.findUniqueOrThrow({ where: { id: employeeId } })).status).toBe("onboarding");

    const P = w.people.P; // card without a login
    const linked = await createAccess(S, newAccess({ workEmail: P.workEmail, firstName: "Other" }));
    expect(linked.employeeId).toBe(P.id);
    expect((await prisma.employee.findUniqueOrThrow({ where: { id: P.id } })).firstName).toBe("P"); // card data kept
    await expect(createAccess(S, newAccess({ workEmail: P.workEmail }))).rejects.toBeInstanceOf(ConflictError);
  });

  it("HR issues access too, but never a superadmin; a regular user cannot", async () => {
    const hrUser = await prisma.user.create({ data: { email: "hr.person@example.test", roleId: w.roles.hr } });
    const hr = await loadActor(hrUser.id);
    await createAccess(hr, newAccess());
    await expect(createAccess(hr, newAccess({ workEmail: "x@example.test", roleId: w.roles.superadmin }))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(resetPassword(hr, w.people.S.userId!)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createAccess(await actorFor(w.people.U), newAccess({ workEmail: "y@example.test" }))).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("sign-in protection", () => {
  it("unknown email and wrong password look the same; 5 failures lock the account for 15 minutes", async () => {
    const S = await actorFor(w.people.S);
    const { password } = await createAccess(S, newAccess());
    expect(await passwordSignIn("nobody@example.test", "x")).toEqual({ ok: false, reason: "invalid" });
    const t0 = new Date("2026-10-22T10:00:00Z");
    for (let i = 0; i < 4; i++) expect(await passwordSignIn("new.person@example.test", "nope", t0)).toEqual({ ok: false, reason: "invalid" });
    expect(await passwordSignIn("new.person@example.test", "nope", t0)).toEqual({ ok: false, reason: "locked" });
    expect((await passwordSignIn("new.person@example.test", password, new Date("2026-10-22T10:10:00Z"))).ok).toBe(false); // still locked
    expect((await passwordSignIn("new.person@example.test", password, new Date("2026-10-22T10:16:00Z"))).ok).toBe(true);
  });

  it("a password reset ends the person's sessions and the old password", async () => {
    const S = await actorFor(w.people.S);
    const { password, userId } = await createAccess(S, newAccess());
    await loadActor(userId, 0);
    const { password: next } = await resetPassword(S, userId);
    await expect(loadActor(userId, 0)).rejects.toBeInstanceOf(UnauthorizedError);
    expect((await passwordSignIn("new.person@example.test", password)).ok).toBe(false);
    expect((await passwordSignIn("new.person@example.test", next)).ok).toBe(true);
  });

  it("deactivation: not yourself, not the last superadmin; a deactivated account cannot sign in", async () => {
    const S = await actorFor(w.people.S);
    const { password, userId } = await createAccess(S, newAccess());
    await expect(setAccountActive(S, S.userId, { active: false })).rejects.toBeInstanceOf(ValidationError);
    await setAccountActive(S, userId, { active: false });
    expect((await passwordSignIn("new.person@example.test", password)).ok).toBe(false);
    await expect(loadActor(userId, 0)).rejects.toBeInstanceOf(UnauthorizedError);

    const hrUser = await prisma.user.create({ data: { email: "hr2@example.test", roleId: w.roles.hr } });
    await expect(setAccountActive(await loadActor(hrUser.id), S.userId, { active: false })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("the first admin (npm run admin:create)", () => {
  it("refuses a second superadmin without --force; --reset issues a new one-time password", async () => {
    await expect(bootstrapSuperadmin({ email: "boss@example.test" })).rejects.toBeInstanceOf(ConflictError); // S exists
    const { password, created } = await bootstrapSuperadmin({ email: "boss@example.test", name: "Boss Admin", force: true });
    expect(created).toBe(true);
    const signIn = await passwordSignIn("boss@example.test", password);
    expect(signIn.ok).toBe(true);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: "boss@example.test" }, include: { role: true } });
    expect(user).toMatchObject({ displayName: "Boss Admin", mustChangePassword: true, role: { code: "superadmin" } });

    const again = await bootstrapSuperadmin({ email: "boss@example.test", reset: true });
    expect((await passwordSignIn("boss@example.test", password)).ok).toBe(false);
    expect((await passwordSignIn("boss@example.test", again.password)).ok).toBe(true);
    await expect(bootstrapSuperadmin({ email: w.people.U.workEmail, reset: true })).rejects.toThrow(); // not a superadmin
  });

  it("on an empty system it creates the first superadmin", async () => {
    await prisma.user.updateMany({ where: { roleId: w.roles.superadmin }, data: { isActive: false } });
    const { created } = await bootstrapSuperadmin({ email: "first@example.test" });
    expect(created).toBe(true);
  });
});
