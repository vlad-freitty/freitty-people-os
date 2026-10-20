/** Phase 4: dashboard blocks respect scopes (PRD 7 — "кожен бачить у межах своїх прав"). */
import { beforeAll, describe, expect, it } from "vitest";
import { parseIsoDate } from "@/lib/dates";
import { prisma } from "@/server/db";
import { expiringDocuments, headcountByDepartment, paymentsByStatus, requestsByStatus } from "@/server/services/dashboard";
import { startRequest } from "@/server/requests/engine";
import { actorFor } from "./helpers";
import { buildEngineWorld } from "./engine-world";

type World = Awaited<ReturnType<typeof buildEngineWorld>>;
let w: World;

beforeAll(async () => {
  w = await buildEngineWorld();
  const soon = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
  for (const e of [w.people.U, w.people.E]) {
    await prisma.document.create({ data: { employeeId: e.id, type: "contract", fileKey: "k", fileName: "c.pdf", mimeType: "application/pdf", size: 1, validTo: parseIsoDate(soon) } });
  }
  await startRequest(w.actors.S, { requestTypeId: w.templates.arm, values: { employee: w.people.U.id, systems: [{ systemId: w.systems.hub.id, level: "x" }] } });
  await startRequest(w.actors.S, { requestTypeId: w.templates.arm, values: { employee: w.people.E.id, systems: [{ systemId: w.systems.hub.id, level: "x" }] } });
});

describe("dashboard scopes", () => {
  it("a dept head gets own department data only", async () => {
    const head = w.actors.H;
    expect((await expiringDocuments(head))!.map((d) => d.employee.id)).toEqual([w.people.U.id]);
    expect(await requestsByStatus(head)).toEqual({ in_progress: 1 });
    const depts = (await headcountByDepartment(head))!.map((d) => d.id).sort();
    expect(depts).toEqual([w.departments.cs.id, w.departments.csNight.id].sort());
    expect(await paymentsByStatus(head)).toBeNull();
  });

  it("a plain user gets none of the team blocks", async () => {
    const user = await actorFor(w.people.U);
    expect(await expiringDocuments(user)).toBeNull();
    expect(await requestsByStatus(user)).toBeNull();
    expect(await headcountByDepartment(user)).toBeNull();
  });

  it("superadmin sees everything", async () => {
    expect((await expiringDocuments(w.actors.S))!.length).toBe(2);
    expect(await requestsByStatus(w.actors.S)).toEqual({ in_progress: 2 });
    expect(await paymentsByStatus(w.actors.S)).toEqual([]);
  });
});
