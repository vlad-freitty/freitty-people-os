import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { audit } from "@/server/audit";
import type { Actor } from "@/server/authz/actor";
import { assertGlobal, can, hasPermission } from "@/server/authz/policy";
import { prisma } from "@/server/db";
import { NotFoundError, ValidationError } from "@/server/errors";

// Equipment and SaaS seats. "Assigned" = assignedToId set and returnedAt empty; returning keeps the last holder
// (assignedToId stays) and sets returnedAt, so history survives without a separate table.

const assetInput = z.object({
  type: z.enum(["laptop", "phone", "license", "other"]),
  name: z.string().trim().min(1).max(150),
  serialOrSeat: z.string().trim().max(150).nullish(),
  monthlyCost: z.coerce.number().min(0).max(1_000_000).nullish(),
  currency: z.string().trim().toUpperCase().length(3).nullish(),
});

type AssetRow = Awaited<ReturnType<typeof loadAssets>>[number];

function loadAssets(where: Prisma.AssetWhereInput) {
  return prisma.asset.findMany({
    where: { deletedAt: null, ...where },
    include: { assignedTo: { select: { id: true, firstName: true, lastName: true, departmentId: true } } },
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });
}

function toDto(a: AssetRow) {
  const assigned = !!a.assignedToId && !a.returnedAt;
  return {
    id: a.id,
    type: a.type,
    name: a.name,
    serialOrSeat: a.serialOrSeat,
    monthlyCost: a.monthlyCost?.toFixed(2) ?? null,
    currency: a.currency,
    assignedTo: assigned && a.assignedTo ? { id: a.assignedTo.id, name: `${a.assignedTo.firstName} ${a.assignedTo.lastName}` } : null,
    assignedAt: assigned ? (a.assignedAt?.toISOString() ?? null) : null,
    returnedAt: a.returnedAt?.toISOString() ?? null,
  };
}

/** Full inventory with assets.manage. */
export async function listAssets(actor: Actor) {
  assertGlobal(actor, "assets.manage");
  return (await loadAssets({})).map(toDto);
}

/** Assets currently held by one employee — visible with employees.view on that person. */
export async function listEmployeeAssets(actor: Actor, employeeId: string) {
  const e = await prisma.employee.findFirst({ where: { id: employeeId, deletedAt: null } });
  const target = e && { employeeId: e.id, departmentId: e.departmentId };
  if (!target || !(hasPermission(actor, "assets.manage") || can(actor, "employees.view", target))) throw new NotFoundError("employee");
  return (await loadAssets({ assignedToId: employeeId, returnedAt: null })).map(toDto);
}

export async function upsertAsset(actor: Actor, raw: unknown, id?: string) {
  assertGlobal(actor, "assets.manage");
  const input = assetInput.parse(raw);
  if (input.monthlyCost != null && !input.currency) throw new ValidationError({ currency: "required_with_cost" });
  return prisma.$transaction(async (tx) => {
    const before = id ? await tx.asset.findFirst({ where: { id, deletedAt: null } }) : null;
    if (id && !before) throw new NotFoundError("asset");
    const data = {
      type: input.type,
      name: input.name,
      serialOrSeat: input.serialOrSeat ?? null,
      monthlyCost: input.monthlyCost ?? null,
      currency: input.currency ?? null,
    };
    const row = id ? await tx.asset.update({ where: { id }, data }) : await tx.asset.create({ data: { ...data, createdById: actor.userId } });
    await audit(tx, actor, { action: id ? "asset.update" : "asset.create", entity: "Asset", entityId: row.id, before, after: row });
    return row;
  });
}

/** Hands an asset to an employee (employeeId) or takes it back (null). */
export async function assignAsset(actor: Actor, id: string, employeeId: string | null) {
  assertGlobal(actor, "assets.manage");
  const asset = await prisma.asset.findFirst({ where: { id, deletedAt: null } });
  if (!asset) throw new NotFoundError("asset");
  const employee = employeeId ? await prisma.employee.findFirst({ where: { id: employeeId, deletedAt: null } }) : null;
  if (employeeId && !employee) throw new ValidationError({ employeeId: "not_found" });
  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const data = employee ? { assignedToId: employee.id, assignedAt: now, returnedAt: null } : { returnedAt: now };
    const row = await tx.asset.update({ where: { id }, data });
    await audit(tx, actor, {
      action: employee ? "asset.assign" : "asset.return",
      entity: "Asset",
      entityId: id,
      before: asset,
      after: row,
      employeeId: employee?.id ?? asset.assignedToId,
      departmentId: employee?.departmentId ?? null,
    });
    return row;
  });
}

/** Monthly cost of assigned licenses per currency (dashboard, PRD 7). */
export async function licenseCosts(actor: Actor) {
  assertGlobal(actor, "assets.manage");
  const rows = await prisma.asset.groupBy({
    by: ["currency"],
    where: { deletedAt: null, type: "license", monthlyCost: { not: null } },
    _sum: { monthlyCost: true },
    _count: true,
  });
  return rows.map((r) => ({ currency: r.currency, total: r._sum.monthlyCost?.toFixed(2) ?? "0.00", count: r._count }));
}
