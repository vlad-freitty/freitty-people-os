import { z } from "zod";
import { audit } from "@/server/audit";
import type { Actor } from "@/server/authz/actor";
import { assertGlobal } from "@/server/authz/policy";
import { prisma } from "@/server/db";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";

// Org structure is readable by every signed-in user (needed for the directory and filters);
// changes require org.manage.

const companyInput = z.object({ name: z.string().trim().min(1).max(100), country: z.string().trim().min(2).max(60) });
const locationInput = z.object({
  name: z.string().trim().min(1).max(100),
  country: z.string().trim().min(2).max(60),
  state: z.string().trim().max(60).nullish(),
  timezone: z.string().refine(isIanaTimezone, "invalid_timezone"),
});
const departmentInput = z.object({
  companyId: z.string().uuid(),
  name: z.string().trim().min(1).max(100),
  parentId: z.string().uuid().nullish(),
});

export function isIanaTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz.includes("/") || tz === "UTC";
  } catch {
    return false;
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- every service takes the actor; org reads are open to all signed-in users
export async function getOrgStructure(_actor: Actor) {
  const [companies, departments, locations] = await Promise.all([
    prisma.company.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }),
    prisma.department.findMany({
      where: { deletedAt: null },
      include: {
        heads: { include: { employee: { select: { id: true, firstName: true, lastName: true, deletedAt: true } } } },
        _count: { select: { employees: { where: { deletedAt: null } } } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.location.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }),
  ]);
  return {
    companies: companies.map((c) => ({ id: c.id, name: c.name, country: c.country, absencePolicyId: c.absencePolicyId })),
    departments: departments.map((d) => ({
      id: d.id,
      companyId: d.companyId,
      name: d.name,
      parentId: d.parentId,
      absencePolicyId: d.absencePolicyId,
      employeeCount: d._count.employees,
      heads: d.heads
        .filter((h) => !h.employee.deletedAt)
        .map((h) => ({ id: h.employee.id, name: `${h.employee.firstName} ${h.employee.lastName}` })),
    })),
    locations: locations.map((l) => ({ id: l.id, name: l.name, country: l.country, state: l.state, timezone: l.timezone })),
  };
}

export async function upsertCompany(actor: Actor, raw: unknown, id?: string) {
  assertGlobal(actor, "org.manage");
  const input = companyInput.parse(raw);
  return prisma.$transaction(async (tx) => {
    const before = id ? await tx.company.findFirst({ where: { id, deletedAt: null } }) : null;
    if (id && !before) throw new NotFoundError("company");
    const clash = await tx.company.findFirst({ where: { name: input.name, id: id ? { not: id } : undefined } });
    if (clash) throw new ConflictError("company name exists");
    const row = id
      ? await tx.company.update({ where: { id }, data: input })
      : await tx.company.create({ data: { ...input, createdById: actor.userId } });
    await audit(tx, actor, { action: id ? "company.update" : "company.create", entity: "Company", entityId: row.id, before, after: row });
    return row;
  });
}

export async function upsertLocation(actor: Actor, raw: unknown, id?: string) {
  assertGlobal(actor, "org.manage");
  const input = locationInput.parse(raw);
  return prisma.$transaction(async (tx) => {
    const before = id ? await tx.location.findFirst({ where: { id, deletedAt: null } }) : null;
    if (id && !before) throw new NotFoundError("location");
    const row = id
      ? await tx.location.update({ where: { id }, data: input })
      : await tx.location.create({ data: { ...input, createdById: actor.userId } });
    await audit(tx, actor, { action: id ? "location.update" : "location.create", entity: "Location", entityId: row.id, before, after: row });
    return row;
  });
}

export async function upsertDepartment(actor: Actor, raw: unknown, id?: string) {
  assertGlobal(actor, "org.manage");
  const input = departmentInput.parse(raw);
  return prisma.$transaction(async (tx) => {
    const before = id ? await tx.department.findFirst({ where: { id, deletedAt: null } }) : null;
    if (id && !before) throw new NotFoundError("department");
    if (input.parentId) {
      const parent = await tx.department.findFirst({ where: { id: input.parentId, deletedAt: null } });
      if (!parent) throw new ValidationError({ parentId: "not_found" });
      if (parent.companyId !== input.companyId) throw new ValidationError({ parentId: "other_company" });
      if (id && (await isDescendantOrSelf(tx, input.parentId, id))) throw new ValidationError({ parentId: "cycle" });
    }
    const row = id
      ? await tx.department.update({ where: { id }, data: input })
      : await tx.department.create({ data: { ...input, createdById: actor.userId } });
    await audit(tx, actor, {
      action: id ? "department.update" : "department.create",
      entity: "Department",
      entityId: row.id,
      before,
      after: row,
      departmentId: row.id,
    });
    return row;
  });
}

async function isDescendantOrSelf(tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], candidateId: string, rootId: string) {
  let current: string | null = candidateId;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    if (current === rootId) return true;
    seen.add(current);
    const d: { parentId: string | null } | null = await tx.department.findUnique({ where: { id: current }, select: { parentId: true } });
    current = d?.parentId ?? null;
  }
  return false;
}

/** Replaces the set of heads of a department. A person may head several departments. */
export async function setDepartmentHeads(actor: Actor, departmentId: string, employeeIds: string[]) {
  assertGlobal(actor, "org.manage");
  const ids = [...new Set(z.array(z.string().uuid()).parse(employeeIds))];
  const dept = await prisma.department.findFirst({ where: { id: departmentId, deletedAt: null }, include: { heads: true } });
  if (!dept) throw new NotFoundError("department");
  const found = await prisma.employee.count({ where: { id: { in: ids }, deletedAt: null } });
  if (found !== ids.length) throw new ValidationError({ employeeIds: "not_found" });

  await prisma.$transaction(async (tx) => {
    await tx.departmentHead.deleteMany({ where: { departmentId } });
    if (ids.length) {
      await tx.departmentHead.createMany({
        data: ids.map((employeeId) => ({ departmentId, employeeId, createdById: actor.userId })),
      });
    }
    await audit(tx, actor, {
      action: "department.heads.set",
      entity: "Department",
      entityId: departmentId,
      before: { heads: dept.heads.map((h) => h.employeeId) },
      after: { heads: ids },
      departmentId,
    });
  });
}
