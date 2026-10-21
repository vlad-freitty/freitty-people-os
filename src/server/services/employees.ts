import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { isIsoDate, parseIsoDate } from "@/lib/dates";
import { audit } from "@/server/audit";
import type { Actor } from "@/server/authz/actor";
import { assertCan, can, employeeScopeWhere, hasPermission, scopeOf } from "@/server/authz/policy";
import { prisma } from "@/server/db";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { planRateAppend } from "@/server/rates";
import { accessLevel, employeeInclude, serializeEmployee, toFull, toRateDto, type EmployeeDto } from "./employee-dto";

/** Statuses shown in the colleague directory to people who only have directory.view. */
const DIRECTORY_STATUSES = ["onboarding", "active", "offboarding"] as const;

const isoDate = z.string().refine(isIsoDate, "invalid_date");

export const employeeInput = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  workEmail: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().max(50).nullish(),
  photo: z.string().url().nullish(),
  departmentId: z.string().uuid(),
  locationId: z.string().uuid().nullish(),
  position: z.string().trim().min(1).max(150),
  managerId: z.string().uuid().nullish(),
  employmentType: z.enum(["employee", "contractor"]),
  grade: z.enum(["senior_management", "middle_management", "first_line_management", "individual_contributor"]).nullish(),
  hireDate: isoDate.nullish(),
  probationEnd: isoDate.nullish(),
  birthDate: isoDate.nullish(),
  showBirthday: z.boolean().default(true),
  status: z.enum(["candidate", "onboarding", "active", "offboarding", "left"]).default("active"),
  locale: z.enum(["uk", "en"]).default("uk"),
});

export type EmployeeInput = z.infer<typeof employeeInput>;

const listQuery = z.object({
  q: z.string().trim().optional(),
  companyId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  status: z.enum(["candidate", "onboarding", "active", "offboarding", "left"]).optional(),
});

export async function listEmployees(actor: Actor, rawQuery: unknown = {}): Promise<EmployeeDto[]> {
  const query = listQuery.parse(rawQuery);
  const scoped = employeeScopeWhere(actor, "employees.view");
  const visibility: Prisma.EmployeeWhereInput[] = [];
  if (scoped) visibility.push(scoped);
  if (hasPermission(actor, "directory.view")) visibility.push({ status: { in: [...DIRECTORY_STATUSES] } });
  if (visibility.length === 0) return [];

  const filters: Prisma.EmployeeWhereInput[] = [{ deletedAt: null }];
  // Prisma drops an empty {} inside OR, so "all" must skip the OR entirely
  if (scopeOf(actor, "employees.view") !== "all") filters.push({ OR: visibility });
  if (query.companyId) filters.push({ companyId: query.companyId });
  if (query.departmentId) filters.push({ departmentId: query.departmentId });
  if (query.status) filters.push({ status: query.status });
  if (query.q) {
    filters.push({
      OR: [
        { firstName: { contains: query.q, mode: "insensitive" } },
        { lastName: { contains: query.q, mode: "insensitive" } },
        { workEmail: { contains: query.q, mode: "insensitive" } },
        { position: { contains: query.q, mode: "insensitive" } },
      ],
    });
  }

  const rows = await prisma.employee.findMany({
    where: { AND: filters },
    include: employeeInclude,
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  return rows.flatMap((row) => {
    const level = accessLevel(actor, row);
    return level ? [serializeEmployee(row, level)] : [];
  });
}

export async function getEmployee(actor: Actor, id: string): Promise<EmployeeDto> {
  const row = await prisma.employee.findFirst({ where: { id, deletedAt: null }, include: employeeInclude });
  const level = row && visibleLevel(actor, row);
  if (!row || !level) throw new NotFoundError("employee");
  return serializeEmployee(row, level);
}

/** Access level for a record the actor may know exists; null → respond 404 (existence is not leaked). */
function visibleLevel(actor: Actor, row: { id: string; departmentId: string; status: string }) {
  const level = accessLevel(actor, row);
  if (level === "basic" && !(DIRECTORY_STATUSES as readonly string[]).includes(row.status)) return null;
  return level;
}

export async function resolveRefs(input: Partial<EmployeeInput>) {
  const errors: Record<string, string> = {};
  let companyId: string | undefined;
  if (input.departmentId) {
    const dept = await prisma.department.findFirst({ where: { id: input.departmentId, deletedAt: null } });
    if (!dept) errors.departmentId = "not_found";
    else companyId = dept.companyId;
  }
  if (input.locationId) {
    const loc = await prisma.location.findFirst({ where: { id: input.locationId, deletedAt: null } });
    if (!loc) errors.locationId = "not_found";
  }
  if (input.managerId) {
    const mgr = await prisma.employee.findFirst({ where: { id: input.managerId, deletedAt: null } });
    if (!mgr) errors.managerId = "not_found";
  }
  if (Object.keys(errors).length) throw new ValidationError(errors);
  return { companyId };
}

export function toData(input: Partial<EmployeeInput>) {
  const date = (v: string | null | undefined) => (v === undefined ? undefined : v === null ? null : parseIsoDate(v));
  return {
    firstName: input.firstName,
    lastName: input.lastName,
    workEmail: input.workEmail,
    phone: input.phone,
    photo: input.photo,
    departmentId: input.departmentId,
    locationId: input.locationId,
    position: input.position,
    managerId: input.managerId,
    employmentType: input.employmentType,
    grade: input.grade,
    hireDate: date(input.hireDate),
    probationEnd: date(input.probationEnd),
    birthDate: date(input.birthDate),
    showBirthday: input.showBirthday,
    status: input.status,
    locale: input.locale,
  };
}

export async function createEmployee(actor: Actor, raw: unknown) {
  const input = employeeInput.parse(raw);
  assertCan(actor, "employees.edit", { departmentId: input.departmentId });
  const { companyId } = await resolveRefs(input);
  if (await prisma.employee.findUnique({ where: { workEmail: input.workEmail } })) {
    throw new ValidationError({ workEmail: "already_exists" });
  }

  return prisma.$transaction(async (tx) => {
    const row = await tx.employee.create({
      data: { ...toData(input), companyId: companyId!, createdById: actor.userId } as Prisma.EmployeeUncheckedCreateInput,
      include: employeeInclude,
    });
    await audit(tx, actor, {
      action: "employee.create",
      entity: "Employee",
      entityId: row.id,
      after: toFull(row),
      departmentId: row.departmentId,
      employeeId: row.id,
    });
    return serializeEmployee(row, accessLevel(actor, row) ?? "basic");
  });
}

export async function updateEmployee(actor: Actor, id: string, raw: unknown) {
  const input = employeeInput.partial().parse(raw);
  const existing = await prisma.employee.findFirst({ where: { id, deletedAt: null }, include: employeeInclude });
  if (!existing) throw new NotFoundError("employee");
  const target = { employeeId: existing.id, departmentId: existing.departmentId };
  if (!visibleLevel(actor, existing) && !can(actor, "employees.edit", target)) throw new NotFoundError("employee");
  assertCan(actor, "employees.edit", target);
  // moving someone to another department requires the right over the destination as well
  if (input.departmentId && input.departmentId !== existing.departmentId) {
    assertCan(actor, "employees.edit", { departmentId: input.departmentId });
  }
  if (input.managerId === id) throw new ValidationError({ managerId: "self" });
  const { companyId } = await resolveRefs(input);
  if (input.workEmail && input.workEmail !== existing.workEmail) {
    if (await prisma.employee.findUnique({ where: { workEmail: input.workEmail } })) {
      throw new ValidationError({ workEmail: "already_exists" });
    }
  }

  return prisma.$transaction(async (tx) => {
    const row = await tx.employee.update({
      where: { id },
      data: { ...toData(input), ...(companyId ? { companyId } : {}) } as Prisma.EmployeeUncheckedUpdateInput,
      include: employeeInclude,
    });
    await audit(tx, actor, {
      action: "employee.update",
      entity: "Employee",
      entityId: id,
      before: toFull(existing),
      after: toFull(row),
      departmentId: row.departmentId,
      employeeId: id,
    });
    return serializeEmployee(row, accessLevel(actor, row) ?? "basic");
  });
}

export async function deleteEmployee(actor: Actor, id: string) {
  const existing = await prisma.employee.findFirst({ where: { id, deletedAt: null }, include: employeeInclude });
  if (!existing) throw new NotFoundError("employee");
  assertCan(actor, "employees.edit", { employeeId: id, departmentId: existing.departmentId });
  if (existing.id === actor.employeeId) throw new ForbiddenError("cannot delete own profile");
  await prisma.$transaction(async (tx) => {
    await tx.employee.update({ where: { id }, data: { deletedAt: new Date() } });
    await audit(tx, actor, {
      action: "employee.delete",
      entity: "Employee",
      entityId: id,
      before: toFull(existing),
      departmentId: existing.departmentId,
      employeeId: id,
    });
  });
}

// ───────────── Rates (sensitive) ─────────────

export const rateInput = z.object({
  rateType: z.enum(["hourly", "per_shift", "monthly"]),
  amount: z.coerce.number().positive().max(10_000_000),
  currency: z.string().trim().toUpperCase().length(3),
  effectiveFrom: isoDate,
});

export async function listRates(actor: Actor, employeeId: string) {
  const e = await prisma.employee.findFirst({ where: { id: employeeId, deletedAt: null } });
  if (!e) throw new NotFoundError("employee");
  if (!can(actor, "employees.view_sensitive", { employeeId: e.id, departmentId: e.departmentId })) {
    throw new NotFoundError("employee");
  }
  const rates = await prisma.rateHistory.findMany({
    where: { employeeId, deletedAt: null },
    orderBy: { effectiveFrom: "desc" },
  });
  return rates.map(toRateDto);
}

export async function addRate(actor: Actor, employeeId: string, raw: unknown) {
  const input = rateInput.parse(raw);
  const e = await prisma.employee.findFirst({ where: { id: employeeId, deletedAt: null } });
  if (!e) throw new NotFoundError("employee");
  assertCan(actor, "rates.edit", { employeeId: e.id, departmentId: e.departmentId });
  return prisma.$transaction((tx) => appendRate(tx, actor, e, input));
}

/** Shared by the API and the CSV import. */
export async function appendRate(
  tx: Prisma.TransactionClient,
  actor: Actor,
  e: { id: string; departmentId: string },
  input: z.infer<typeof rateInput>,
) {
  const existing = await tx.rateHistory.findMany({ where: { employeeId: e.id, deletedAt: null } });
  const effectiveFrom = parseIsoDate(input.effectiveFrom);
  const plan = planRateAppend(existing, effectiveFrom);
  if (!plan.ok) throw new ValidationError({ effectiveFrom: plan.reason });
  if (plan.close) {
    await tx.rateHistory.update({ where: { id: plan.close.id }, data: { effectiveTo: plan.close.effectiveTo } });
  }
  const rate = await tx.rateHistory.create({
    data: {
      employeeId: e.id,
      rateType: input.rateType,
      amount: input.amount,
      currency: input.currency,
      effectiveFrom,
      createdById: actor.userId,
    },
  });
  const dto = toRateDto(rate);
  await audit(tx, actor, {
    action: "rate.create",
    entity: "RateHistory",
    entityId: rate.id,
    after: dto,
    departmentId: e.departmentId,
    employeeId: e.id,
  });
  return dto;
}
