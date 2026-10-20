import type { EmploymentType, EmployeeStatus } from "@prisma/client";
import { loadActor } from "@/server/authz/actor";
import { prisma } from "@/server/db";
import { ensureSystemRoles } from "@/server/seed/roles";

const TABLES = [
  "absence_ledger_entry", "absence_balance", "absence", "absence_policy", "absence_type", "layer_assignment", "calendar_event", "calendar_layer", "work_week",
  "comment", "step_instance", "request_field_value", "access_grant", "document", "request", "step_template", "form_field",
  "request_type_version", "request_type", "asset", "access_bundle_item", "access_bundle", "system",
  "audit_log", "rate_history", "department_head", "employee", "app_user", "role_permission", "role", "department", "location", "company",
];

/** Empties the test database. Refuses to run against anything that is not a *_test database. */
export async function resetDb() {
  const url = process.env.DATABASE_URL ?? "";
  if (!/\/[a-z_]*_test(\?|$)/.test(url)) throw new Error(`refusing to truncate non-test database: ${url}`);
  await prisma.$executeRawUnsafe(`TRUNCATE ${TABLES.map((t) => `"${t}"`).join(", ")} CASCADE`);
}

const d = (s: string) => new Date(`${s}T00:00:00Z`);

/**
 * Fixed test world:
 *   Company A: Sales, CS (head: H) → CS Night (child of CS)
 *   Company B: Eng
 *   S superadmin (A/Sales), C ceo (A/Sales), H dept head (A/CS), U user (A/CS Night),
 *   P plain employee without login (A/Sales), E engineer (B/Eng), K candidate (B/Eng)
 */
export async function buildWorld() {
  await resetDb();
  const roles = await ensureSystemRoles(prisma);
  const a = await prisma.company.create({ data: { name: "A Corp", country: "US" } });
  const b = await prisma.company.create({ data: { name: "B Corp", country: "UA" } });
  const loc = await prisma.location.create({ data: { name: "Kyiv", country: "UA", timezone: "Europe/Kyiv" } });
  const sales = await prisma.department.create({ data: { companyId: a.id, name: "Sales" } });
  const cs = await prisma.department.create({ data: { companyId: a.id, name: "CS" } });
  const csNight = await prisma.department.create({ data: { companyId: a.id, name: "CS Night", parentId: cs.id } });
  const eng = await prisma.department.create({ data: { companyId: b.id, name: "Eng" } });

  const person = async (
    key: string,
    departmentId: string,
    companyId: string,
    opts: { role?: string; status?: EmployeeStatus; type?: EmploymentType; showBirthday?: boolean } = {},
  ) => {
    const email = `${key.toLowerCase()}@example.test`;
    const user = opts.role ? await prisma.user.create({ data: { email, roleId: roles[opts.role] } }) : null;
    return prisma.employee.create({
      data: {
        firstName: key,
        lastName: "Test",
        workEmail: email,
        phone: "+380000000000",
        companyId,
        departmentId,
        locationId: loc.id,
        position: `${key} position`,
        employmentType: opts.type ?? "employee",
        hireDate: d("2024-02-29"),
        birthDate: d("1990-03-14"),
        showBirthday: opts.showBirthday ?? true,
        status: opts.status ?? "active",
        userId: user?.id,
        rates: { create: { rateType: "monthly", amount: 1000, currency: "USD", effectiveFrom: d("2024-01-01") } },
      },
    });
  };

  const S = await person("S", sales.id, a.id, { role: "superadmin" });
  const C = await person("C", sales.id, a.id, { role: "ceo" });
  const H = await person("H", cs.id, a.id, { role: "dept_head" });
  const U = await person("U", csNight.id, a.id, { role: "user", type: "contractor" });
  const P = await person("P", sales.id, a.id, { showBirthday: false });
  const E = await person("E", eng.id, b.id, { role: "user" });
  const K = await person("K", eng.id, b.id, { status: "candidate" });
  await prisma.departmentHead.create({ data: { departmentId: cs.id, employeeId: H.id } });

  return {
    roles,
    companies: { a, b },
    departments: { sales, cs, csNight, eng },
    location: loc,
    people: { S, C, H, U, P, E, K },
  };
}

export async function actorFor(employee: { userId: string | null }) {
  if (!employee.userId) throw new Error("employee has no user");
  return loadActor(employee.userId);
}

export const BASIC_KEYS = ["access", "birthday", "company", "department", "firstName", "id", "lastName", "photo", "position", "workEmail"].sort();
export const FULL_KEYS = [
  ...BASIC_KEYS,
  "birthDate",
  "employmentType",
  "hireDate",
  "locale",
  "location",
  "manager",
  "phone",
  "probationEnd",
  "role",
  "showBirthday",
  "status",
].sort();
export const SENSITIVE_KEYS = [...FULL_KEYS, "currentRate"].sort();

export const keys = (o: object) => Object.keys(o).sort();
