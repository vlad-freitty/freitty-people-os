/** Editing and removing companies, departments and locations; the once-a-day balance sync. */
import { beforeEach, describe, expect, it } from "vitest";
import { parseIsoDate } from "@/lib/dates";
import { prisma } from "@/server/db";
import { ForbiddenError, ValidationError } from "@/server/errors";
import { getBalances, upsertPolicy } from "@/server/services/absences";
import { deleteCompany, deleteDepartment, deleteLocation, getOrgStructure, upsertCompany, upsertDepartment } from "@/server/services/org";
import { ensureAbsenceTypes, ensurePtoPolicies } from "@/server/seed/calendar";
import { actorFor, buildWorld } from "./helpers";

type World = Awaited<ReturnType<typeof buildWorld>>;
let w: World;

beforeEach(async () => {
  w = await buildWorld();
});

describe("companies, departments, locations", () => {
  it("a department with people or sub-departments cannot be removed; an empty one can, and its name is free again", async () => {
    const S = await actorFor(w.people.S);
    await expect(deleteDepartment(S, w.departments.cs.id)).rejects.toMatchObject({ details: { department: "has_subdepartments" } });
    await expect(deleteDepartment(S, w.departments.sales.id)).rejects.toMatchObject({ details: { department: expect.stringMatching(/^has_people_/) } });

    const empty = await upsertDepartment(S, { companyId: w.companies.a.id, name: "Marketing" });
    await prisma.departmentHead.create({ data: { departmentId: empty.id, employeeId: w.people.H.id } });
    await deleteDepartment(S, empty.id);
    const org = await getOrgStructure(S);
    expect(org.departments.map((d) => d.name)).not.toContain("Marketing");
    expect(await prisma.departmentHead.count({ where: { departmentId: empty.id } })).toBe(0);
    await upsertDepartment(S, { companyId: w.companies.a.id, name: "Marketing" }); // the name can be used again
    expect(await prisma.auditLog.count({ where: { action: "department.delete" } })).toBe(1);
  });

  it("people who left do not block removing a department", async () => {
    const S = await actorFor(w.people.S);
    await prisma.employee.updateMany({ where: { departmentId: w.departments.eng.id }, data: { status: "left" } });
    await deleteDepartment(S, w.departments.eng.id);
    expect((await prisma.department.findUniqueOrThrow({ where: { id: w.departments.eng.id } })).deletedAt).not.toBeNull();
  });

  it("a company is removed only without departments; renaming works; only org.manage may do it", async () => {
    const S = await actorFor(w.people.S);
    await expect(deleteCompany(S, w.companies.b.id)).rejects.toMatchObject({ details: { company: "has_departments_1" } });
    await expect(deleteCompany(await actorFor(w.people.U), w.companies.b.id)).rejects.toBeInstanceOf(ForbiddenError);
    await upsertCompany(S, { name: "B Group", country: "UA" }, w.companies.b.id);
    const fresh = await upsertCompany(S, { name: "Empty Co", country: "US" });
    await deleteCompany(S, fresh.id);
    expect((await getOrgStructure(S)).companies.map((c) => c.name).sort()).toEqual(["A Corp", "B Group"]);
  });

  it("a location with people stays", async () => {
    const S = await actorFor(w.people.S);
    await expect(deleteLocation(S, w.location.id)).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("balances are synced at most once a day", () => {
  it("the second view does not re-sync, a policy change does", async () => {
    await ensureAbsenceTypes(prisma);
    await ensurePtoPolicies(prisma);
    const { E } = w.people;
    await prisma.employee.update({ where: { id: E.id }, data: { hireDate: parseIsoDate("2024-01-15") } });
    const user = await actorFor(E);
    const vacation = async () => (await getBalances(user, E.id)).balances.find((b) => b.type.code === "vacation")!.balance;
    expect(await vacation()).toBe(10);
    expect((await prisma.employee.findUniqueOrThrow({ where: { id: E.id } })).balancesSyncedOn).not.toBeNull();

    const policy = await prisma.absencePolicy.findFirstOrThrow({ where: { isDefault: true, absenceType: { code: "vacation" } } });
    const S = await actorFor(w.people.S);
    await upsertPolicy(S, {
      name: policy.name,
      absenceTypeId: policy.absenceTypeId,
      isDefault: true,
      daysPerPeriod: 15,
      accrual: "upfront",
      periodStart: "hire_date",
      expiry: "end_of_period",
    }, policy.id);
    expect((await prisma.employee.findUniqueOrThrow({ where: { id: E.id } })).balancesSyncedOn).toBeNull();
    // a period already accrued keeps its 10 days; the change applies from the next period — but the view is re-synced
    expect(await vacation()).toBe(10);
  });
});
