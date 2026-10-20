/** Configurable roles: the superadmin changes what a role can do, and the API follows immediately. */
import { beforeAll, describe, expect, it } from "vitest";
import { loadActor } from "@/server/authz/actor";
import { prisma } from "@/server/db";
import { ConflictError, ForbiddenError } from "@/server/errors";
import { listEmployees } from "@/server/services/employees";
import { assignRole, createRole, deleteRole, listRoles, updateRole } from "@/server/services/roles";
import { actorFor, buildWorld, FULL_KEYS, keys, SENSITIVE_KEYS } from "./helpers";

type World = Awaited<ReturnType<typeof buildWorld>>;
let w: World;

beforeAll(async () => {
  w = await buildWorld();
});

describe("custom role", () => {
  it("grants exactly the configured permissions", async () => {
    const admin = await actorFor(w.people.S);
    const role = await createRole(admin, {
      code: "recruiter",
      nameUk: "Рекрутер",
      permissions: { "directory.view": "all", "employees.view": "all" },
    });
    await assignRole(admin, w.people.E.userId!, role.id);

    let recruiter = await actorFor(w.people.E);
    let rows = await listEmployees(recruiter);
    expect(rows).toHaveLength(7); // employees.view=all includes candidates
    for (const r of rows) {
      expect(r.access).toBe("full");
      expect(keys(r)).toEqual(FULL_KEYS); // no currentRate
    }

    await updateRole(admin, role.id, { permissions: { "employees.view": "all", "employees.view_sensitive": "all" } });
    recruiter = await actorFor(w.people.E);
    rows = await listEmployees(recruiter);
    for (const r of rows) expect(keys(r)).toEqual(SENSITIVE_KEYS);
  });

  it("rejects unknown permissions and scopes not allowed for a permission", async () => {
    const admin = await actorFor(w.people.S);
    await expect(createRole(admin, { code: "bad_one", nameUk: "x", permissions: { "nope.view": "all" } })).rejects.toThrow();
    await expect(createRole(admin, { code: "bad_two", nameUk: "x", permissions: { "roles.manage": "self" } })).rejects.toThrow();
  });

  it("cannot delete a role that still has users, can delete an empty custom role", async () => {
    const admin = await actorFor(w.people.S);
    const recruiter = (await listRoles(admin)).find((r) => r.code === "recruiter")!;
    await expect(deleteRole(admin, recruiter.id)).rejects.toBeInstanceOf(ConflictError);
    const empty = await createRole(admin, { code: "temp_role", nameUk: "Тимчасова", permissions: {} });
    await deleteRole(admin, empty.id);
    expect((await listRoles(admin)).some((r) => r.code === "temp_role")).toBe(false);
  });
});

describe("guards", () => {
  it("superadmin role is locked", async () => {
    const admin = await actorFor(w.people.S);
    await expect(updateRole(admin, w.roles.superadmin, { permissions: {} })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(deleteRole(admin, w.roles.superadmin)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("only a superadmin can grant the superadmin role (CEO has all other rights)", async () => {
    const ceo = await actorFor(w.people.C);
    await expect(assignRole(ceo, w.people.U.userId!, w.roles.superadmin)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(assignRole(ceo, w.people.S.userId!, w.roles.user)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("the last superadmin cannot be demoted", async () => {
    const admin = await actorFor(w.people.S);
    await expect(assignRole(admin, w.people.S.userId!, w.roles.user)).rejects.toBeInstanceOf(ConflictError);
  });

  it("dept head without roles.* gets forbidden", async () => {
    const head = await actorFor(w.people.H);
    await expect(listRoles(head)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(assignRole(head, w.people.U.userId!, w.roles.ceo)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("role changes are audited", async () => {
    const entries = await prisma.auditLog.findMany({ where: { action: { in: ["role.create", "role.update", "user.role.assign"] } } });
    expect(entries.length).toBeGreaterThanOrEqual(3);
  });

  it("a deactivated user is rejected", async () => {
    await prisma.user.update({ where: { id: w.people.U.userId! }, data: { isActive: false } });
    await expect(loadActor(w.people.U.userId!)).rejects.toThrow();
    await prisma.user.update({ where: { id: w.people.U.userId! }, data: { isActive: true } });
  });
});
