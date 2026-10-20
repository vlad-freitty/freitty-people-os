import { prisma } from "@/server/db";
import { seedStarterTemplates } from "@/server/seed/templates";
import type { Actor } from "@/server/authz/actor";
import { actorFor, buildWorld } from "./helpers";

/**
 * Phase 0 world + people for the assignment roles, systems with owners, an access bundle and the starter templates.
 *   HR (role hr), LEG (legal), FIN (finance), OA (office_admin) — all in A/Sales
 *   N — new hire in A/CS, status onboarding, position "New Agent", no login
 *   Systems: Hub (owner H), HubSpot (owner E), Dialpad (no owner → needs_assignment)
 *   Bundle "CS agent" for position "New Agent": Hub=agent, HubSpot=user
 */
export async function buildEngineWorld() {
  const w = await buildWorld();
  const { roles } = w;
  const person = async (key: string, role: string | null, data: Partial<{ departmentId: string; status: "onboarding" | "active"; position: string }> = {}) => {
    const email = `${key.toLowerCase()}@example.test`;
    const user = role ? await prisma.user.create({ data: { email, roleId: roles[role] } }) : null;
    return prisma.employee.create({
      data: {
        firstName: key,
        lastName: "Test",
        workEmail: email,
        companyId: w.companies.a.id,
        departmentId: data.departmentId ?? w.departments.sales.id,
        locationId: w.location.id,
        position: data.position ?? `${key} position`,
        employmentType: "employee",
        status: data.status ?? "active",
        userId: user?.id,
      },
    });
  };
  const HR = await person("HR", "hr");
  const LEG = await person("LEG", "legal");
  const FIN = await person("FIN", "finance");
  const OA = await person("OA", "office_admin");
  const N = await person("N", null, { departmentId: w.departments.cs.id, status: "onboarding", position: "New Agent" });

  const hub = await prisma.system.create({ data: { name: "Hub", ownerEmployeeId: w.people.H.id } });
  const hubspot = await prisma.system.create({ data: { name: "HubSpot", ownerEmployeeId: w.people.E.id } });
  const dialpad = await prisma.system.create({ data: { name: "Dialpad" } });
  await prisma.accessBundle.create({
    data: {
      name: "CS agent",
      positionOrRole: "New Agent",
      items: { create: [{ systemId: hub.id, accessLevel: "agent" }, { systemId: hubspot.id, accessLevel: "user" }] },
    },
  });
  const templates = await seedStarterTemplates(prisma);

  const actors: Record<string, Actor> = {};
  for (const [k, e] of Object.entries({ ...w.people, HR, LEG, FIN, OA })) if (e.userId) actors[k] = await actorFor(e);

  return { ...w, people: { ...w.people, HR, LEG, FIN, OA, N }, systems: { hub, hubspot, dialpad }, templates, actors };
}

/** Active steps of a request, with their template names — handy for driving a request through the engine. */
export async function activeSteps(requestId: string) {
  return prisma.stepInstance.findMany({
    where: { requestId, status: { in: ["active", "needs_assignment"] } },
    include: { stepTemplate: true, system: true },
    orderBy: [{ orderGroup: "asc" }, { createdAt: "asc" }],
  });
}
