import { z } from "zod";
import { audit } from "@/server/audit";
import type { Actor } from "@/server/authz/actor";
import { assertGlobal, can } from "@/server/authz/policy";
import { prisma, type Tx } from "@/server/db";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";

// Systems and access bundles are readable by every signed-in user (needed to fill access requests);
// changes require systems.manage.

const systemInput = z.object({
  name: z.string().trim().min(1).max(100),
  ownerEmployeeId: z.string().uuid().nullish(),
  isActive: z.boolean().default(true),
});

const bundleInput = z.object({
  name: z.string().trim().min(1).max(100),
  positionOrRole: z.string().trim().min(1).max(150),
  items: z.array(z.object({ systemId: z.string().uuid(), accessLevel: z.string().trim().min(1).max(50) })),
});

export async function listSystems(_actor: Actor) {
  void _actor;
  const rows = await prisma.system.findMany({
    where: { deletedAt: null },
    include: { owner: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: { name: "asc" },
  });
  return rows.map((s) => ({
    id: s.id,
    name: s.name,
    isActive: s.isActive,
    owner: s.owner ? { id: s.owner.id, name: `${s.owner.firstName} ${s.owner.lastName}` } : null,
  }));
}

export async function upsertSystem(actor: Actor, raw: unknown, id?: string) {
  assertGlobal(actor, "systems.manage");
  const input = systemInput.parse(raw);
  if (input.ownerEmployeeId && !(await prisma.employee.findFirst({ where: { id: input.ownerEmployeeId, deletedAt: null } }))) {
    throw new ValidationError({ ownerEmployeeId: "not_found" });
  }
  return prisma.$transaction(async (tx) => {
    const before = id ? await tx.system.findFirst({ where: { id, deletedAt: null } }) : null;
    if (id && !before) throw new NotFoundError("system");
    if (await tx.system.findFirst({ where: { name: input.name, id: id ? { not: id } : undefined } })) {
      throw new ConflictError("system name exists");
    }
    const data = { name: input.name, ownerEmployeeId: input.ownerEmployeeId ?? null, isActive: input.isActive };
    const row = id ? await tx.system.update({ where: { id }, data }) : await tx.system.create({ data: { ...data, createdById: actor.userId } });
    await audit(tx, actor, { action: id ? "system.update" : "system.create", entity: "System", entityId: row.id, before, after: row });
    return row;
  });
}

export async function listBundles(_actor: Actor) {
  void _actor;
  const rows = await prisma.accessBundle.findMany({
    where: { deletedAt: null },
    include: { items: { include: { system: { select: { id: true, name: true } } } } },
    orderBy: { name: "asc" },
  });
  return rows.map((b) => ({
    id: b.id,
    name: b.name,
    positionOrRole: b.positionOrRole,
    items: b.items.map((i) => ({ systemId: i.systemId, systemName: i.system.name, accessLevel: i.accessLevel })),
  }));
}

export async function upsertBundle(actor: Actor, raw: unknown, id?: string) {
  assertGlobal(actor, "systems.manage");
  const input = bundleInput.parse(raw);
  const systemIds = [...new Set(input.items.map((i) => i.systemId))];
  if (systemIds.length !== input.items.length) throw new ValidationError({ items: "duplicate_system" });
  if ((await prisma.system.count({ where: { id: { in: systemIds }, deletedAt: null } })) !== systemIds.length) {
    throw new ValidationError({ items: "system_not_found" });
  }
  return prisma.$transaction(async (tx) => {
    const before = id ? await tx.accessBundle.findFirst({ where: { id, deletedAt: null }, include: { items: true } }) : null;
    if (id && !before) throw new NotFoundError("bundle");
    const row = id
      ? await tx.accessBundle.update({ where: { id }, data: { name: input.name, positionOrRole: input.positionOrRole } })
      : await tx.accessBundle.create({ data: { name: input.name, positionOrRole: input.positionOrRole, createdById: actor.userId } });
    await tx.accessBundleItem.deleteMany({ where: { bundleId: row.id } });
    await tx.accessBundleItem.createMany({ data: input.items.map((i) => ({ bundleId: row.id, ...i })) });
    await audit(tx, actor, {
      action: id ? "bundle.update" : "bundle.create",
      entity: "AccessBundle",
      entityId: row.id,
      before,
      after: { ...row, items: input.items },
    });
    return row;
  });
}

/** Access template for a position — pre-fills the child access request during onboarding (PRD 4, template 4). */
export async function bundleForPosition(tx: Tx, position: string) {
  const bundle = await tx.accessBundle.findFirst({
    where: { deletedAt: null, positionOrRole: { equals: position.trim(), mode: "insensitive" } },
    include: { items: { include: { system: true } } },
  });
  return bundle?.items.filter((i) => i.system.isActive && !i.system.deletedAt).map((i) => ({ systemId: i.systemId, level: i.accessLevel })) ?? [];
}

/** Active and past grants of one employee — visible with employees.view on that person. */
export async function listGrants(actor: Actor, employeeId: string) {
  const e = await prisma.employee.findFirst({ where: { id: employeeId, deletedAt: null } });
  if (!e || !can(actor, "employees.view", { employeeId: e.id, departmentId: e.departmentId })) throw new NotFoundError("employee");
  const rows = await prisma.accessGrant.findMany({
    where: { employeeId },
    include: { system: { select: { name: true } }, request: { select: { id: true, number: true } } },
    orderBy: [{ revokedAt: { sort: "desc", nulls: "first" } }, { grantedAt: "desc" }],
  });
  return rows.map((g) => ({
    id: g.id,
    systemId: g.systemId,
    systemName: g.system.name,
    accessLevel: g.accessLevel,
    grantedAt: g.grantedAt.toISOString(),
    revokedAt: g.revokedAt?.toISOString() ?? null,
    request: g.request,
  }));
}
