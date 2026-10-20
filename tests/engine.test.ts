/** Phase 1 acceptance: request engine end to end (PRD 8, phase 1 "Готово, коли"). */
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { actOnStep, cancelRequest, reassignStep, startRequest, uploadStepDocument } from "@/server/requests/engine";
import { getRequest, listMyTasks, listNeedsAssignment, listRequests } from "@/server/services/requests";
import { createTemplate, getTemplate, listTemplates, publishTemplate, saveDraft } from "@/server/services/templates";
import { activeSteps, buildEngineWorld } from "./engine-world";

type World = Awaited<ReturnType<typeof buildEngineWorld>>;
let w: World;

beforeEach(async () => {
  w = await buildEngineWorld();
});

const pdf = { name: "nda.pdf", type: "application/pdf", data: Buffer.from("%PDF-1.4 fake nda") };

async function stepBy(requestId: string, name: string) {
  const step = (await activeSteps(requestId)).find((s) => s.stepTemplate.nameUk === name);
  if (!step) throw new Error(`no active step "${name}" in ${requestId}`);
  return step;
}

describe("onboarding end to end", () => {
  it("runs NDA + profile → child ARM + equipment → welcome meeting, then activates the employee", async () => {
    const { HR, LEG, OA, H, E, N } = w.people;
    const { id } = await startRequest(w.actors.HR, { requestTypeId: w.templates.onboarding, values: { employee: N.id } });

    // group 1 runs in parallel: legal uploads the NDA, HR fills the profile
    const nda = await stepBy(id, "NDA");
    expect(nda.assigneeId).toBe(LEG.id);
    expect(nda.dueAt).not.toBeNull();
    await uploadStepDocument(w.actors.LEG, nda.id, pdf, {});
    const doc = await prisma.document.findFirstOrThrow({ where: { employeeId: N.id } });
    expect(doc.type).toBe("nda");
    expect(doc.requestId).toBe(id);

    const profile = await stepBy(id, "Створення профілю");
    expect(profile.assigneeId).toBe(HR.id);
    await actOnStep(w.actors.HR, profile.id, { action: "fill", values: { start_date: "2026-11-02" } });

    // group 2: the child ARM starts automatically with systems from the position's access bundle
    const childStep = await stepBy(id, "Доступи за шаблоном посади");
    const child = await prisma.request.findUniqueOrThrow({ where: { parentStepId: childStep.id }, include: { values: true } });
    const systems = child.values.find((v) => v.fieldKey === "systems")!.value as { systemId: string; level: string }[];
    expect(systems).toHaveLength(2);
    expect(child.initiatorId).toBe(HR.id);

    // child ARM: manager approval → system owners in parallel → confirmation by the initiator (HR)
    await actOnStep(w.actors.H, (await stepBy(child.id, "Погодження керівником")).id, { action: "approve" });
    const owners = (await activeSteps(child.id)).filter((s) => s.stepTemplate.nameUk === "Видача доступу");
    expect(owners.map((s) => s.assigneeId).sort()).toEqual([H.id, E.id].sort());
    await actOnStep(w.actors.H, owners.find((s) => s.assigneeId === H.id)!.id, { action: "complete" });
    expect(await prisma.stepInstance.count({ where: { requestId: child.id, orderGroup: 3 } })).toBe(0); // group waits for both
    await actOnStep(w.actors.E, owners.find((s) => s.assigneeId === E.id)!.id, { action: "complete" });
    await actOnStep(w.actors.HR, (await stepBy(child.id, "Підтвердження ініціатором")).id, { action: "approve" });

    expect((await prisma.request.findUniqueOrThrow({ where: { id: child.id } })).status).toBe("done");
    const grants = await prisma.accessGrant.findMany({ where: { employeeId: N.id, revokedAt: null } });
    expect(grants.map((g) => g.accessLevel).sort()).toEqual(["agent", "user"]);
    expect((await prisma.stepInstance.findUniqueOrThrow({ where: { id: childStep.id } })).status).toBe("done");

    // equipment checklist closes the step once every item is ticked
    const equipment = await stepBy(id, "Видача техніки");
    expect(equipment.assigneeId).toBe(OA.id);
    await actOnStep(w.actors.OA, equipment.id, { action: "checklist", checked: [0] });
    expect((await prisma.stepInstance.findUniqueOrThrow({ where: { id: equipment.id } })).status).toBe("active");
    await actOnStep(w.actors.OA, equipment.id, { action: "checklist", checked: [0, 1] });

    // group 3: welcome meeting with the head of the new hire's department
    const meeting = await stepBy(id, "Вступна зустріч");
    expect(meeting.assigneeId).toBe(H.id);
    await actOnStep(w.actors.H, meeting.id, { action: "complete" });

    const done = await prisma.request.findUniqueOrThrow({ where: { id } });
    expect(done.status).toBe("done");
    const n = await prisma.employee.findUniqueOrThrow({ where: { id: N.id } });
    expect(n.status).toBe("active");
    expect(n.hireDate?.toISOString().slice(0, 10)).toBe("2026-11-02");
    expect(n.probationEnd?.toISOString().slice(0, 10)).toBe("2027-01-31");
  });
});

describe("offboarding", () => {
  async function grant(employeeId: string, systemId: string) {
    await prisma.accessGrant.create({ data: { employeeId, systemId, accessLevel: "user" } });
  }

  it("revokes every access, takes back every asset, marks the person left", async () => {
    const { N, H, E, OA, FIN } = w.people;
    await grant(N.id, w.systems.hub.id);
    await grant(N.id, w.systems.hubspot.id);
    const laptop = await prisma.asset.create({ data: { type: "laptop", name: "ThinkPad", assignedToId: N.id, assignedAt: new Date() } });
    const seat = await prisma.asset.create({ data: { type: "license", name: "HubSpot seat", monthlyCost: 50, currency: "USD", assignedToId: N.id, assignedAt: new Date() } });

    const { id } = await startRequest(w.actors.HR, { requestTypeId: w.templates.offboarding, values: { employee: N.id, last_day: "2026-11-30" } });
    expect((await prisma.employee.findUniqueOrThrow({ where: { id: N.id } })).status).toBe("offboarding");

    await actOnStep(w.actors.H, (await stepBy(id, "Підтвердження дати керівником")).id, { action: "approve" });
    const revoke = (await activeSteps(id)).filter((s) => s.stepTemplate.nameUk === "Відкликання доступу");
    expect(revoke.map((s) => s.system?.name).sort()).toEqual(["Hub", "HubSpot"]);
    await actOnStep(w.actors.H, revoke.find((s) => s.assigneeId === H.id)!.id, { action: "complete" });
    await actOnStep(w.actors.E, revoke.find((s) => s.assigneeId === E.id)!.id, { action: "complete" });
    const collect = await stepBy(id, "Прийом техніки");
    expect(collect.assigneeId).toBe(OA.id);
    await actOnStep(w.actors.OA, collect.id, { action: "checklist", checked: [0, 1, 2] });
    const settle = await stepBy(id, "Закриття розрахунку");
    expect(settle.assigneeId).toBe(FIN.id);
    await actOnStep(w.actors.FIN, settle.id, { action: "complete" });

    expect((await prisma.request.findUniqueOrThrow({ where: { id } })).status).toBe("done");
    expect(await prisma.accessGrant.count({ where: { employeeId: N.id, revokedAt: null } })).toBe(0);
    expect(await prisma.accessGrant.count({ where: { employeeId: N.id } })).toBe(2); // history kept
    for (const a of [laptop, seat]) {
      const after = await prisma.asset.findUniqueOrThrow({ where: { id: a.id } });
      expect(after.returnedAt).not.toBeNull();
    }
    expect((await prisma.employee.findUniqueOrThrow({ where: { id: N.id } })).status).toBe("left");
  });

  it("with no accesses the owner group is empty, and the login is disabled at the end", async () => {
    const { U } = w.people;
    const { id } = await startRequest(w.actors.H, { requestTypeId: w.templates.offboarding, values: { employee: U.id, last_day: "2026-11-30" } });
    await actOnStep(w.actors.H, (await stepBy(id, "Підтвердження дати керівником")).id, { action: "approve" });
    expect((await activeSteps(id)).map((s) => s.stepTemplate.nameUk)).toEqual(["Прийом техніки"]);
    await actOnStep(w.actors.OA, (await stepBy(id, "Прийом техніки")).id, { action: "checklist", checked: [0, 1, 2] });
    await actOnStep(w.actors.FIN, (await stepBy(id, "Закриття розрахунку")).id, { action: "complete" });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: U.userId! } })).isActive).toBe(false);
  });

  it("cancelling an offboarding puts the person back to active", async () => {
    const { N } = w.people;
    const { id } = await startRequest(w.actors.HR, { requestTypeId: w.templates.offboarding, values: { employee: N.id, last_day: "2026-11-30" } });
    await cancelRequest(w.actors.HR, id);
    expect((await prisma.request.findUniqueOrThrow({ where: { id } })).status).toBe("cancelled");
    expect((await prisma.employee.findUniqueOrThrow({ where: { id: N.id } })).status).toBe("active");
  });
});

describe("template versions", () => {
  it("publishing v2 does not change requests created on v1", async () => {
    const { E, H } = w.people;
    const S = w.actors.S;
    const values = { employee: E.id, systems: [{ systemId: w.systems.hub.id, level: "admin" }] };
    const onV1 = await startRequest(S, { requestTypeId: w.templates.arm, values });

    // v2 drops the confirmation group
    const tpl = await getTemplate(S, w.templates.arm);
    const steps = tpl.content.steps.filter((s) => s.orderGroup < 3);
    await saveDraft(S, w.templates.arm, { fields: tpl.content.fields, steps });
    expect((await publishTemplate(S, w.templates.arm)).version).toBe(2);
    const versions = await prisma.requestTypeVersion.findMany({ where: { requestTypeId: w.templates.arm }, orderBy: { version: "asc" } });
    expect(versions.map((v) => v.status)).toEqual(["archived", "published"]);

    const onV2 = await startRequest(S, { requestTypeId: w.templates.arm, values: { ...values, systems: [{ systemId: w.systems.hub.id, level: "viewer" }] } });

    // E's department head in company B does not exist → approval needs assignment; superadmin assigns it
    for (const id of [onV1.id, onV2.id]) {
      const approval = await stepBy(id, "Погодження керівником");
      expect(approval.status).toBe("needs_assignment");
      await reassignStep(S, approval.id, H.id);
      await actOnStep(w.actors.H, approval.id, { action: "approve" });
      await actOnStep(w.actors.H, (await stepBy(id, "Видача доступу")).id, { action: "complete" });
    }
    // v1 still asks the initiator to confirm, v2 is already done
    expect((await prisma.request.findUniqueOrThrow({ where: { id: onV1.id } })).status).toBe("in_progress");
    expect((await activeSteps(onV1.id))[0].stepTemplate.nameUk).toBe("Підтвердження ініціатором");
    expect((await prisma.request.findUniqueOrThrow({ where: { id: onV2.id } })).status).toBe("done");
  });

  it("keeps the step order inside a stage as arranged in the constructor", async () => {
    const tpl = await getTemplate(w.actors.S, w.templates.onboarding);
    expect(tpl.content.steps.map((s) => s.nameUk)).toEqual(["NDA", "Створення профілю", "Доступи за шаблоном посади", "Видача техніки", "Вступна зустріч"]);
    const reversed = { fields: tpl.content.fields, steps: [tpl.content.steps[1], tpl.content.steps[0], ...tpl.content.steps.slice(2)] };
    await saveDraft(w.actors.S, w.templates.onboarding, reversed);
    expect((await getTemplate(w.actors.S, w.templates.onboarding)).content.steps[0].nameUk).toBe("Створення профілю");
  });

  it("refuses to publish a template without the fields its kind needs", async () => {
    const S = w.actors.S;
    const { id } = await createTemplate(S, { code: "bad_access", nameUk: "Без систем", kind: "access", whoCanInitiate: { mode: "all" } });
    await saveDraft(S, id, {
      fields: [{ key: "employee", labelUk: "Хто", type: "person", required: true }],
      steps: [{ orderGroup: 1, nameUk: "Ок", stepType: "approve", assigneeRule: "initiator", slaDays: 1 }],
    });
    await expect(publishTemplate(S, id)).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("department isolation", () => {
  it("a dept head sees global templates and own department's, not another department's", async () => {
    const S = w.actors.S;
    const eng = await createTemplate(S, {
      code: "eng_only",
      nameUk: "Заявка інженерів",
      kind: "generic",
      departmentId: w.departments.eng.id,
      whoCanInitiate: { mode: "departments", departmentIds: [w.departments.eng.id] },
    });
    const listed = (await listTemplates(w.actors.H)).map((t) => t.id);
    expect(listed).toContain(w.templates.arm);
    expect(listed).not.toContain(eng.id);
    await expect(getTemplate(w.actors.H, eng.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(saveDraft(w.actors.H, w.templates.arm, { fields: [], steps: [] })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("a dept head does not see requests of other departments", async () => {
    const { E, U } = w.people;
    const aboutE = await startRequest(w.actors.S, { requestTypeId: w.templates.arm, values: { employee: E.id, systems: [{ systemId: w.systems.hub.id, level: "x" }] } });
    const aboutU = await startRequest(w.actors.S, { requestTypeId: w.templates.arm, values: { employee: U.id, systems: [{ systemId: w.systems.hub.id, level: "x" }] } });
    const ids = (await listRequests(w.actors.H)).map((r) => r.id);
    expect(ids).toContain(aboutU.id);
    expect(ids).not.toContain(aboutE.id);
    await expect(getRequest(w.actors.H, aboutE.id)).rejects.toBeInstanceOf(NotFoundError);
    // a plain user sees neither, unless involved
    await expect(getRequest(w.actors.P ?? w.actors.E, aboutU.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("engine rules", () => {
  it("only the assignee executes a step — even a superadmin is refused", async () => {
    const { id } = await startRequest(w.actors.HR, { requestTypeId: w.templates.onboarding, values: { employee: w.people.N.id } });
    const nda = await stepBy(id, "NDA");
    await expect(uploadStepDocument(w.actors.S, nda.id, pdf, {})).rejects.toBeInstanceOf(ForbiddenError);
    await expect(actOnStep(w.actors.S, (await stepBy(id, "Створення профілю")).id, { action: "fill", values: { start_date: "2026-11-02" } })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("a system without owner → needs assignment, listed for the superadmin, then reassigned", async () => {
    const { id } = await startRequest(w.actors.S, {
      requestTypeId: w.templates.arm,
      values: { employee: w.people.U.id, systems: [{ systemId: w.systems.dialpad.id, level: "agent" }] },
    });
    await actOnStep(w.actors.H, (await stepBy(id, "Погодження керівником")).id, { action: "approve" });
    const orphan = await stepBy(id, "Видача доступу");
    expect(orphan.status).toBe("needs_assignment");
    expect((await listNeedsAssignment(w.actors.S)).map((s) => s.stepId)).toContain(orphan.id);
    await reassignStep(w.actors.S, orphan.id, w.people.OA.id);
    expect((await listMyTasks(w.actors.OA)).map((t) => t.stepId)).toContain(orphan.id);
    const audit = await prisma.auditLog.findFirst({ where: { action: "step.reassign", entityId: orphan.id } });
    expect(audit).not.toBeNull();
  });

  it("rejection needs a comment; 'return' sends the request back to an earlier group", async () => {
    const { id } = await startRequest(w.actors.S, {
      requestTypeId: w.templates.arm,
      values: { employee: w.people.U.id, systems: [{ systemId: w.systems.hub.id, level: "agent" }] },
    });
    await actOnStep(w.actors.H, (await stepBy(id, "Погодження керівником")).id, { action: "approve" });
    await actOnStep(w.actors.H, (await stepBy(id, "Видача доступу")).id, { action: "complete" });
    const confirm = await stepBy(id, "Підтвердження ініціатором");
    await expect(actOnStep(w.actors.S, confirm.id, { action: "reject" })).rejects.toThrow();
    await actOnStep(w.actors.S, confirm.id, { action: "reject", comment: "Доступ не працює" });

    const again = await stepBy(id, "Видача доступу");
    expect(again.orderGroup).toBe(2);
    expect((await prisma.request.findUniqueOrThrow({ where: { id } })).currentGroup).toBe(2);
    expect(await prisma.stepInstance.count({ where: { requestId: id, stepTemplate: { nameUk: "Видача доступу" } } })).toBe(2); // history kept
  });

  it("'close' rejection ends the request", async () => {
    const { id } = await startRequest(w.actors.S, {
      requestTypeId: w.templates.arm,
      values: { employee: w.people.U.id, systems: [{ systemId: w.systems.hub.id, level: "agent" }] },
    });
    await actOnStep(w.actors.H, (await stepBy(id, "Погодження керівником")).id, { action: "reject", comment: "Не потрібно" });
    expect((await prisma.request.findUniqueOrThrow({ where: { id } })).status).toBe("rejected");
    expect(await activeSteps(id)).toHaveLength(0);
  });

  it("a step cannot be completed twice", async () => {
    const { id } = await startRequest(w.actors.S, {
      requestTypeId: w.templates.arm,
      values: { employee: w.people.U.id, systems: [{ systemId: w.systems.hub.id, level: "agent" }] },
    });
    const approval = await stepBy(id, "Погодження керівником");
    await actOnStep(w.actors.H, approval.id, { action: "approve" });
    await expect(actOnStep(w.actors.H, approval.id, { action: "approve" })).rejects.toBeInstanceOf(ConflictError);
  });

  it("hiring: CEO approval → HR search → candidate selected creates a candidate employee", async () => {
    const { id } = await startRequest(w.actors.H, {
      requestTypeId: w.templates.hiring,
      values: { position: "CS Agent", department: w.departments.cs.id, budget: 1200, desired_date: "2026-12-01", employment_type: "contractor" },
    });
    await actOnStep(w.actors.C, (await stepBy(id, "Погодження CEO")).id, { action: "approve" });
    await actOnStep(w.actors.HR, (await stepBy(id, "Старт пошуку")).id, { action: "complete" });
    await expect(
      actOnStep(w.actors.HR, (await stepBy(id, "Кандидат обраний")).id, { action: "fill", values: { candidate_first_name: "Olha" } }),
    ).rejects.toBeInstanceOf(ValidationError);
    await actOnStep(w.actors.HR, (await stepBy(id, "Кандидат обраний")).id, {
      action: "fill",
      values: { candidate_first_name: "Olha", candidate_last_name: "Newhire", candidate_email: "olha.newhire@example.test" },
    });
    const candidate = await prisma.employee.findUniqueOrThrow({ where: { workEmail: "olha.newhire@example.test" } });
    expect(candidate).toMatchObject({ status: "candidate", position: "CS Agent", departmentId: w.departments.cs.id, employmentType: "contractor" });
  });

  it("who_can_initiate is enforced", async () => {
    // offboarding is limited to dept_head / hr / ceo
    await expect(
      startRequest(w.actors.U, { requestTypeId: w.templates.offboarding, values: { employee: w.people.P.id, last_day: "2026-12-01" } }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("missing required fields are reported per field", async () => {
    await expect(startRequest(w.actors.S, { requestTypeId: w.templates.arm, values: {} })).rejects.toMatchObject({
      details: { employee: "required", systems: "required" },
    });
  });
});
