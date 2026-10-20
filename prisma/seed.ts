// Fake data only (PRD 9, rule 4): names are invented, emails use the reserved example.test domain.
import { PrismaClient, type EmploymentType, type RateType } from "@prisma/client";
import { ensureSystemRoles } from "../src/server/seed/roles";

const prisma = new PrismaClient();
const d = (s: string) => new Date(`${s}T00:00:00Z`);

async function main() {
  const roles = await ensureSystemRoles(prisma);

  const companies = Object.fromEntries(
    await Promise.all(
      [
        { name: "FREITTY", country: "US" },
        { name: "NETQOR", country: "UA" },
        { name: "YBIS", country: "UA" },
      ].map(async (c) => {
        const row = await prisma.company.upsert({ where: { name: c.name }, update: {}, create: c });
        return [c.name, row.id] as const;
      }),
    ),
  );

  const locations = Object.fromEntries(
    await Promise.all(
      [
        { name: "Kyiv", country: "UA", state: null, timezone: "Europe/Kyiv" },
        { name: "Columbus, OH", country: "US", state: "Ohio", timezone: "America/New_York" },
        { name: "Remote", country: "—", state: null, timezone: "UTC" },
      ].map(async (l) => {
        const row = await prisma.location.upsert({ where: { name: l.name }, update: {}, create: l });
        return [l.name, row.id] as const;
      }),
    ),
  );

  const departments: Record<string, string> = {};
  const dept = async (company: string, name: string, parent?: string) => {
    const row = await prisma.department.upsert({
      where: { companyId_name: { companyId: companies[company], name } },
      update: {},
      create: { companyId: companies[company], name, parentId: parent ? departments[parent] : null },
    });
    departments[name] = row.id;
  };
  await dept("FREITTY", "Management");
  await dept("FREITTY", "Customer Success");
  await dept("FREITTY", "CS Night Shift", "Customer Success");
  await dept("FREITTY", "Sales");
  await dept("NETQOR", "Engineering");
  await dept("NETQOR", "HR & People");
  await dept("YBIS", "Finance");
  await dept("YBIS", "Legal");

  type P = {
    email: string;
    first: string;
    last: string;
    dept: string;
    company: string;
    position: string;
    location: string;
    type?: EmploymentType;
    hire: string;
    birth?: string;
    role?: string;
    rate?: { type: RateType; amount: number; currency: string; from: string }[];
  };
  const people: P[] = [
    { email: "superadmin@example.test", first: "Оксана", last: "Адмінська", dept: "HR & People", company: "NETQOR", position: "HR Lead", location: "Kyiv", hire: "2022-03-01", birth: "1990-05-14", role: "superadmin", rate: [{ type: "monthly", amount: 2500, currency: "USD", from: "2022-03-01" }] },
    { email: "ceo@example.test", first: "Андрій", last: "Директоренко", dept: "Management", company: "FREITTY", position: "CEO", location: "Kyiv", hire: "2020-01-10", birth: "1985-11-02", role: "ceo", rate: [{ type: "monthly", amount: 8000, currency: "USD", from: "2020-01-10" }] },
    { email: "cs.head@example.test", first: "Марія", last: "Керівна", dept: "Customer Success", company: "FREITTY", position: "Head of Customer Success", location: "Kyiv", hire: "2021-06-01", birth: "1992-02-29", role: "dept_head", rate: [{ type: "monthly", amount: 3500, currency: "USD", from: "2021-06-01" }, { type: "monthly", amount: 4000, currency: "USD", from: "2024-01-01" }] },
    { email: "eng.head@example.test", first: "Тарас", last: "Інженерський", dept: "Engineering", company: "NETQOR", position: "Engineering Manager", location: "Kyiv", hire: "2021-09-15", role: "dept_head", rate: [{ type: "monthly", amount: 5000, currency: "USD", from: "2021-09-15" }] },
    { email: "agent.ivanna@example.test", first: "Іванна", last: "Підтримко", dept: "Customer Success", company: "FREITTY", position: "CS Agent", location: "Kyiv", hire: "2024-02-01", birth: "1998-07-21", role: "user", rate: [{ type: "hourly", amount: 6, currency: "USD", from: "2024-02-01" }, { type: "hourly", amount: 7.5, currency: "USD", from: "2025-01-01" }] },
    { email: "agent.mike@example.test", first: "Mike", last: "Nightowl", dept: "CS Night Shift", company: "FREITTY", position: "CS Agent", location: "Columbus, OH", type: "contractor", hire: "2025-04-07", birth: "1995-12-03", role: "user", rate: [{ type: "per_shift", amount: 120, currency: "USD", from: "2025-04-07" }] },
    { email: "agent.sara@example.test", first: "Sara", last: "Shiftwell", dept: "CS Night Shift", company: "FREITTY", position: "CS Agent", location: "Columbus, OH", type: "contractor", hire: "2026-08-01", rate: [{ type: "per_shift", amount: 110, currency: "USD", from: "2026-08-01" }] },
    { email: "sales.olga@example.test", first: "Ольга", last: "Продажна", dept: "Sales", company: "FREITTY", position: "Account Executive", location: "Kyiv", hire: "2023-05-15", rate: [{ type: "monthly", amount: 2200, currency: "USD", from: "2023-05-15" }] },
    { email: "dev.petro@example.test", first: "Петро", last: "Кодович", dept: "Engineering", company: "NETQOR", position: "Backend Developer", location: "Kyiv", hire: "2022-11-01", birth: "1994-04-04", role: "user", rate: [{ type: "monthly", amount: 4200, currency: "USD", from: "2022-11-01" }] },
    { email: "dev.lina@example.test", first: "Ліна", last: "Фронтенко", dept: "Engineering", company: "NETQOR", position: "Frontend Developer", location: "Remote", type: "contractor", hire: "2026-09-01", rate: [{ type: "hourly", amount: 25, currency: "USD", from: "2026-09-01" }] },
    { email: "fin.nadia@example.test", first: "Надія", last: "Рахункова", dept: "Finance", company: "YBIS", position: "Finance Manager", location: "Kyiv", hire: "2021-02-01", rate: [{ type: "monthly", amount: 3000, currency: "UAH", from: "2021-02-01" }] },
    { email: "legal.yuri@example.test", first: "Юрій", last: "Законний", dept: "Legal", company: "YBIS", position: "Legal Counsel", location: "Kyiv", hire: "2022-07-01" },
  ];

  for (const p of people) {
    const data = {
      firstName: p.first,
      lastName: p.last,
      companyId: companies[p.company],
      departmentId: departments[p.dept],
      locationId: locations[p.location],
      position: p.position,
      employmentType: p.type ?? "employee",
      hireDate: d(p.hire),
      probationEnd: new Date(d(p.hire).getTime() + 90 * 86400_000),
      birthDate: p.birth ? d(p.birth) : null,
      locale: p.location === "Columbus, OH" ? ("en" as const) : ("uk" as const),
    };
    const e = await prisma.employee.upsert({ where: { workEmail: p.email }, update: {}, create: { ...data, workEmail: p.email } });
    if (p.role && !e.userId) {
      const user = await prisma.user.upsert({ where: { email: p.email }, update: {}, create: { email: p.email, roleId: roles[p.role] } });
      await prisma.employee.update({ where: { id: e.id }, data: { userId: user.id } });
    }
    for (const [i, r] of (p.rate ?? []).entries()) {
      const next = p.rate![i + 1];
      await prisma.rateHistory.upsert({
        where: { employeeId_effectiveFrom: { employeeId: e.id, effectiveFrom: d(r.from) } },
        update: {},
        create: {
          employeeId: e.id,
          rateType: r.type,
          amount: r.amount,
          currency: r.currency,
          effectiveFrom: d(r.from),
          effectiveTo: next ? new Date(d(next.from).getTime() - 86400_000) : null,
        },
      });
    }
  }

  const heads: [string, string][] = [
    ["Customer Success", "cs.head@example.test"],
    ["Engineering", "eng.head@example.test"],
    ["HR & People", "superadmin@example.test"],
  ];
  for (const [deptName, email] of heads) {
    const e = await prisma.employee.findUniqueOrThrow({ where: { workEmail: email } });
    await prisma.departmentHead.upsert({
      where: { departmentId_employeeId: { departmentId: departments[deptName], employeeId: e.id } },
      update: {},
      create: { departmentId: departments[deptName], employeeId: e.id },
    });
  }

  console.log(`Seeded: ${people.length} employees, ${Object.keys(departments).length} departments.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
