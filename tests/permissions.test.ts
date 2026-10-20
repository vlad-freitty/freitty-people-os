/**
 * Phase 0 acceptance: for each of the 4 roles the API returns exactly the allowed data,
 * including sensitive fields. Tests go through the real route handlers (HTTP JSON), only the
 * session lookup is replaced.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/server/authz/actor";
import { buildWorld, actorFor, BASIC_KEYS, SENSITIVE_KEYS, keys } from "./helpers";

let current: Actor | null = null;
vi.mock("@/server/auth/session", () => ({
  getActor: async () => {
    if (!current) {
      const { UnauthorizedError } = await import("@/server/errors");
      throw new UnauthorizedError();
    }
    return current;
  },
}));

const employeesRoute = await import("@/app/api/v1/employees/route");
const employeeRoute = await import("@/app/api/v1/employees/[id]/route");
const ratesRoute = await import("@/app/api/v1/employees/[id]/rates/route");
const rolesRoute = await import("@/app/api/v1/roles/route");
const usersRoute = await import("@/app/api/v1/users/route");
const auditRoute = await import("@/app/api/v1/audit-log/route");
const importRoute = await import("@/app/api/v1/import/[kind]/route");

type World = Awaited<ReturnType<typeof buildWorld>>;
let w: World;
const actors: Record<string, Actor> = {};

const req = (url: string, init?: RequestInit) => new Request(`http://test${url}`, init);
const noParams = { params: Promise.resolve({}) } as never;
const withId = (id: string) => ({ params: Promise.resolve({ id }) });

async function call(res: Promise<Response>) {
  const r = await res;
  const body = r.status === 204 ? null : await r.json();
  return { status: r.status, body };
}

async function list(as: string) {
  current = actors[as];
  const { status, body } = await call(employeesRoute.GET(req("/api/v1/employees"), noParams));
  expect(status).toBe(200);
  return body.data as Array<Record<string, unknown> & { id: string; access: string }>;
}

async function get(as: string, id: string) {
  current = actors[as];
  return call(employeeRoute.GET(req(`/api/v1/employees/${id}`), withId(id)));
}

async function rates(as: string, id: string) {
  current = actors[as];
  return call(ratesRoute.GET(req(`/api/v1/employees/${id}/rates`), withId(id)));
}

async function patch(as: string, id: string, body: unknown) {
  current = actors[as];
  return call(
    employeeRoute.PATCH(
      req(`/api/v1/employees/${id}`, { method: "PATCH", body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
      withId(id),
    ),
  );
}

beforeAll(async () => {
  w = await buildWorld();
  const { S, C, H, U, E } = w.people;
  actors.superadmin = await actorFor(S);
  actors.ceo = await actorFor(C);
  actors.head = await actorFor(H);
  actors.user = await actorFor(U);
  actors.engineer = await actorFor(E);
});

beforeEach(() => {
  current = null;
});

describe("unauthenticated", () => {
  it("gets 401 and no data", async () => {
    const { status, body } = await call(employeesRoute.GET(req("/api/v1/employees"), noParams));
    expect(status).toBe(401);
    expect(body.data).toBeUndefined();
  });
});

describe.each(["superadmin", "ceo"])("%s", (role) => {
  it("sees everyone, including candidates, with sensitive fields", async () => {
    const rows = await list(role);
    expect(rows).toHaveLength(7);
    for (const r of rows) {
      expect(r.access).toBe("sensitive");
      expect(keys(r)).toEqual(SENSITIVE_KEYS);
    }
    const u = rows.find((r) => r.id === w.people.U.id)!;
    expect(u.currentRate).toMatchObject({ amount: "1000.00", currency: "USD", rateType: "monthly" });
  });

  it("reads rate history of any employee", async () => {
    const { status, body } = await rates(role, w.people.E.id);
    expect(status).toBe(200);
    expect(body.data).toHaveLength(1);
  });

  it("edits any profile", async () => {
    const { status } = await patch(role, w.people.E.id, { position: `edited by ${role}` });
    expect(status).toBe(200);
  });

  it("manages roles and sees users", async () => {
    current = actors[role];
    expect((await call(rolesRoute.GET(req("/api/v1/roles"), noParams))).status).toBe(200);
    expect((await call(usersRoute.GET(req("/api/v1/users"), noParams))).status).toBe(200);
  });
});

describe("department head", () => {
  it("gets sensitive data for own department and sub-departments, basic directory for the rest", async () => {
    const rows = await list("head");
    const byId = new Map(rows.map((r) => [r.id, r]));
    const { S, C, H, U, P, E, K } = w.people;

    for (const own of [H, U]) {
      expect(byId.get(own.id)?.access).toBe("sensitive");
      expect(keys(byId.get(own.id)!)).toEqual(SENSITIVE_KEYS);
    }
    for (const other of [S, C, P, E]) {
      expect(byId.get(other.id)?.access).toBe("basic");
      expect(keys(byId.get(other.id)!)).toEqual(BASIC_KEYS);
    }
    expect(byId.has(K.id)).toBe(false); // candidates are not in the directory
    expect(rows).toHaveLength(6);
  });

  it("basic directory never contains phone, dates, status or money", async () => {
    const { body } = await get("head", w.people.P.id);
    const json = JSON.stringify(body.data);
    expect(keys(body.data)).toEqual(BASIC_KEYS);
    expect(json).not.toContain("+380");
    expect(json).not.toContain("1000");
    expect(json).not.toContain("1990"); // birth year hidden
    expect(body.data.birthday).toBeNull(); // P opted out of showing the birthday
  });

  it("shows the birthday without the year when allowed", async () => {
    const { body } = await get("head", w.people.E.id);
    expect(body.data.birthday).toBe("03-14");
  });

  it("cannot read rates of other departments (404, existence not leaked)", async () => {
    expect((await rates("head", w.people.P.id)).status).toBe(404);
    expect((await rates("head", w.people.U.id)).status).toBe(200);
  });

  it("does not see candidates of other departments at all", async () => {
    expect((await get("head", w.people.K.id)).status).toBe(404);
  });

  it("edits own department only and cannot move people out of scope", async () => {
    expect((await patch("head", w.people.U.id, { position: "Senior agent" })).status).toBe(200);
    expect((await patch("head", w.people.P.id, { position: "nope" })).status).toBe(403);
    expect((await patch("head", w.people.U.id, { departmentId: w.departments.sales.id })).status).toBe(403);
  });

  it("cannot manage roles", async () => {
    current = actors.head;
    expect((await call(rolesRoute.GET(req("/api/v1/roles"), noParams))).status).toBe(403);
    expect((await call(usersRoute.GET(req("/api/v1/users"), noParams))).status).toBe(403);
  });

  it("cannot run imports", async () => {
    current = actors.head;
    const res = await call(
      importRoute.POST(req("/api/v1/import/org", { method: "POST", body: JSON.stringify({ csv: "company,department\nX,Y" }) }), {
        params: Promise.resolve({ kind: "org" }),
      }),
    );
    expect(res.status).toBe(403);
  });
});

describe("user", () => {
  it("sees own profile with money, colleagues as basic directory only", async () => {
    const rows = await list("user");
    const me = rows.find((r) => r.id === w.people.U.id)!;
    expect(me.access).toBe("sensitive");
    expect(keys(me)).toEqual(SENSITIVE_KEYS);
    for (const r of rows.filter((r) => r.id !== w.people.U.id)) {
      expect(r.access).toBe("basic");
      expect(keys(r)).toEqual(BASIC_KEYS);
    }
    expect(rows.some((r) => r.id === w.people.K.id)).toBe(false);
  });

  it("reads own rates only", async () => {
    expect((await rates("user", w.people.U.id)).status).toBe(200);
    expect((await rates("user", w.people.H.id)).status).toBe(404);
  });

  it("cannot edit anyone, including self", async () => {
    expect((await patch("user", w.people.U.id, { position: "CEO" })).status).toBe(403);
    expect((await patch("user", w.people.H.id, { position: "x" })).status).toBe(403);
  });

  it("sees only own actions in the audit log", async () => {
    current = actors.user;
    const { status, body } = await call(auditRoute.GET(req("/api/v1/audit-log"), noParams));
    expect(status).toBe(200);
    for (const row of body.data) expect(row.actor?.id).toBe(actors.user.userId);
  });
});

describe("audit log scope", () => {
  it("department head sees entries about own departments, not others", async () => {
    current = actors.head;
    const { body } = await call(auditRoute.GET(req("/api/v1/audit-log"), noParams));
    const ids = body.data.map((r: { entityId: string }) => r.entityId);
    expect(ids).toContain(w.people.U.id); // edited above by head
    expect(ids).not.toContain(w.people.E.id); // edited by superadmin/ceo in another company
  });

  it("superadmin sees everything", async () => {
    current = actors.superadmin;
    const { body } = await call(auditRoute.GET(req("/api/v1/audit-log"), noParams));
    const ids = body.data.map((r: { entityId: string }) => r.entityId);
    expect(ids).toContain(w.people.U.id);
    expect(ids).toContain(w.people.E.id);
  });
});
