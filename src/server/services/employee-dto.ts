import type { Prisma } from "@prisma/client";
import type { Actor } from "@/server/authz/actor";
import { can, hasPermission } from "@/server/authz/policy";
import { toIsoDate, toMonthDay } from "@/lib/dates";

/**
 * Field levels returned by the API. The serializer is the only place that turns an Employee row into JSON,
 * so a field never reaches a client that has no right to it.
 *   basic     — colleague directory (PRD 2: name, photo, department, position, work contact, birthday w/o year)
 *   full      — whole profile except money
 *   sensitive — full + current rate (rate history has its own endpoint, same permission)
 */
export type AccessLevel = "basic" | "full" | "sensitive";

export const employeeInclude = {
  company: { select: { id: true, name: true } },
  department: { select: { id: true, name: true } },
  location: { select: { id: true, name: true, timezone: true } },
  manager: { select: { id: true, firstName: true, lastName: true } },
  user: { select: { id: true, role: { select: { code: true, nameUk: true, nameEn: true } } } },
  rates: { where: { deletedAt: null }, orderBy: { effectiveFrom: "desc" } },
} satisfies Prisma.EmployeeInclude;

export type EmployeeRow = Prisma.EmployeeGetPayload<{ include: typeof employeeInclude }>;

export function accessLevel(actor: Actor, e: { id: string; departmentId: string }): AccessLevel | null {
  const target = { employeeId: e.id, departmentId: e.departmentId };
  if (can(actor, "employees.view", target)) {
    return can(actor, "employees.view_sensitive", target) ? "sensitive" : "full";
  }
  if (hasPermission(actor, "directory.view")) return "basic";
  return null;
}

export function toBasic(e: EmployeeRow) {
  return {
    id: e.id,
    firstName: e.firstName,
    lastName: e.lastName,
    photo: e.photo,
    position: e.position,
    workEmail: e.workEmail,
    company: e.company,
    department: e.department,
    birthday: e.showBirthday ? toMonthDay(e.birthDate) : null,
  };
}

export function toFull(e: EmployeeRow) {
  return {
    ...toBasic(e),
    phone: e.phone,
    location: e.location,
    manager: e.manager ? { id: e.manager.id, name: `${e.manager.firstName} ${e.manager.lastName}` } : null,
    employmentType: e.employmentType,
    grade: e.grade,
    hireDate: toIsoDate(e.hireDate),
    probationEnd: toIsoDate(e.probationEnd),
    birthDate: toIsoDate(e.birthDate),
    showBirthday: e.showBirthday,
    status: e.status,
    locale: e.locale,
    role: e.user?.role ?? null,
  };
}

export function toRateDto(r: EmployeeRow["rates"][number]) {
  return {
    id: r.id,
    rateType: r.rateType,
    amount: r.amount.toFixed(2),
    currency: r.currency,
    effectiveFrom: toIsoDate(r.effectiveFrom)!,
    effectiveTo: toIsoDate(r.effectiveTo),
  };
}

export function toSensitive(e: EmployeeRow, today = new Date()) {
  const current = e.rates.find((r) => r.effectiveFrom <= today && (!r.effectiveTo || r.effectiveTo >= today));
  return { ...toFull(e), currentRate: current ? toRateDto(current) : null };
}

export type EmployeeBasicDto = ReturnType<typeof toBasic>;
export type EmployeeFullDto = ReturnType<typeof toFull>;
export type EmployeeSensitiveDto = ReturnType<typeof toSensitive>;
export type EmployeeDto =
  | ({ access: "basic" } & EmployeeBasicDto)
  | ({ access: "full" } & EmployeeFullDto)
  | ({ access: "sensitive" } & EmployeeSensitiveDto);

export function serializeEmployee(e: EmployeeRow, level: AccessLevel): EmployeeDto {
  if (level === "sensitive") return { access: level, ...toSensitive(e) };
  if (level === "full") return { access: level, ...toFull(e) };
  return { access: level, ...toBasic(e) };
}
