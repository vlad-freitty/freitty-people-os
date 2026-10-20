/** Phase 0 acceptance: importing 50 test people twice creates no duplicates. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "@/server/authz/actor";
import { prisma } from "@/server/db";
import { runImport } from "@/server/services/import";
import { actorFor, buildWorld } from "./helpers";

const fixture = (name: string) => readFileSync(path.join(__dirname, "..", "prisma", "fixtures", name), "utf8");

let admin: Actor;
let baseline: number;

beforeAll(async () => {
  const w = await buildWorld();
  admin = await actorFor(w.people.S);
  baseline = await prisma.employee.count();
});

describe("org import", () => {
  it("creates companies and departments with parents, second run changes nothing", async () => {
    const csv = fixture("org.csv");
    const first = await runImport(admin, "org", csv, true);
    expect(first.committed).toBe(true);
    expect(first.summary.error).toBe(0);

    const second = await runImport(admin, "org", csv, true);
    expect(second.summary).toMatchObject({ create: 0, update: 0, error: 0 });

    const night = await prisma.department.findFirstOrThrow({ where: { name: "Night Shift" }, include: { parent: true } });
    expect(night.parent?.name).toBe("Customer Care");
  });
});

describe("employees import", () => {
  it("preview writes nothing", async () => {
    const preview = await runImport(admin, "employees", fixture("employees-50.csv"), false);
    expect(preview.committed).toBe(false);
    expect(preview.summary.create).toBe(50);
    expect(await prisma.employee.count()).toBe(baseline);
  });

  it("imports 50 people, a repeated import creates no duplicates", async () => {
    const csv = fixture("employees-50.csv");
    const first = await runImport(admin, "employees", csv, true);
    expect(first.summary).toMatchObject({ create: 50, error: 0 });
    expect(first.committed).toBe(true);
    expect(await prisma.employee.count()).toBe(baseline + 50);

    const second = await runImport(admin, "employees", csv, true);
    expect(second.summary).toMatchObject({ create: 0, update: 0, unchanged: 50, error: 0 });
    expect(await prisma.employee.count()).toBe(baseline + 50);
  });

  it("links managers listed later in the file", async () => {
    const e = await prisma.employee.findUniqueOrThrow({ where: { workEmail: "person01@example.test" }, include: { manager: true } });
    expect(e.manager?.workEmail).toBe("person50@example.test");
  });

  it("re-import with a changed field updates only that row", async () => {
    const csv = fixture("employees-50.csv").replace("person07@example.test,Ім'я07,Прізвище07,", "person07@example.test,Ім'я07,Змінене07,");
    const res = await runImport(admin, "employees", csv, true);
    expect(res.summary).toMatchObject({ create: 0, update: 1, unchanged: 49 });
    expect((await prisma.employee.findUniqueOrThrow({ where: { workEmail: "person07@example.test" } })).lastName).toBe("Змінене07");
  });

  it("a file with errors is reported per line and nothing is saved", async () => {
    const csv = [
      "work_email,first_name,last_name,company,department,position,employment_type",
      "new.one@example.test,New,One,Octo Labs,Customer Care,Agent,employee",
      "not-an-email,Bad,Row,Octo Labs,Customer Care,Agent,employee",
      "new.two@example.test,New,Two,Nope Inc,Customer Care,Agent,freelancer",
      "new.one@example.test,Dup,Licate,Octo Labs,Customer Care,Agent,employee",
    ].join("\n");
    const before = await prisma.employee.count();
    const res = await runImport(admin, "employees", csv, true);
    expect(res.committed).toBe(false);
    expect(res.rows.map((r) => [r.line, r.action])).toEqual([
      [2, "create"],
      [3, "error"],
      [4, "error"],
      [5, "error"],
    ]);
    expect(res.rows[3].errors.join()).toContain("duplicate of line 2");
    expect(await prisma.employee.count()).toBe(before);
  });
});

describe("rates import", () => {
  it("imports rate history in any order, closes previous periods, second run is a no-op", async () => {
    const csv = fixture("rates.csv");
    const first = await runImport(admin, "rates", csv, true);
    expect(first.summary.error).toBe(0);
    const e = await prisma.employee.findUniqueOrThrow({ where: { workEmail: "person01@example.test" } });
    const rates = await prisma.rateHistory.findMany({ where: { employeeId: e.id }, orderBy: { effectiveFrom: "asc" } });
    expect(rates.map((r) => [r.effectiveFrom.toISOString().slice(0, 10), r.effectiveTo?.toISOString().slice(0, 10) ?? null])).toEqual([
      ["2025-01-01", "2025-06-30"],
      ["2025-07-01", null],
    ]);

    const second = await runImport(admin, "rates", csv, true);
    expect(second.summary).toMatchObject({ create: 0, error: 0 });
  });

  it("refuses to silently change an existing rate", async () => {
    const csv = "work_email,rate_type,amount,currency,effective_from\nperson01@example.test,hourly,99,USD,2025-01-01\n";
    const res = await runImport(admin, "rates", csv, true);
    expect(res.committed).toBe(false);
    expect(res.rows[0].action).toBe("error");
  });
});
