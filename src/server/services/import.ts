import Papa from "papaparse";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { isIsoDate, parseIsoDate, toIsoDate } from "@/lib/dates";
import { audit } from "@/server/audit";
import type { Actor } from "@/server/authz/actor";
import { assertGlobal } from "@/server/authz/policy";
import { prisma, type Tx } from "@/server/db";
import { ValidationError } from "@/server/errors";
import { planRateAppend } from "@/server/rates";
import { appendRate } from "./employees";
import { importAccesses, importAssets, importBalances } from "./import-extra";

/**
 * Initial import (PRD 7): upload → preview with per-row errors → confirm.
 * Re-importing the same file changes nothing: employees are keyed by work_email, departments by
 * (company, name), rates by (work_email, effective_from). Commit is all-or-nothing and refuses files with errors.
 */

export const IMPORT_KINDS = ["org", "employees", "rates", "balances", "accesses", "assets"] as const;
export type ImportKind = (typeof IMPORT_KINDS)[number];

export const IMPORT_TEMPLATES: Record<ImportKind, string[]> = {
  org: ["company", "company_country", "department", "parent_department"],
  employees: [
    "work_email",
    "first_name",
    "last_name",
    "phone",
    "company",
    "department",
    "location",
    "position",
    "manager_email",
    "employment_type",
    "hire_date",
    "probation_end",
    "birth_date",
    "show_birthday",
    "status",
    "locale",
  ],
  rates: ["work_email", "rate_type", "amount", "currency", "effective_from"],
  balances: ["work_email", "days", "comment"],
  accesses: ["work_email", "system", "access_level", "granted_at"],
  assets: ["type", "name", "serial_or_seat", "monthly_cost", "currency", "assigned_to_email", "assigned_at"],
};

export type RowAction = "create" | "update" | "unchanged" | "error";
export type PreviewRow = { line: number; key: string; action: RowAction; errors: string[] };
export type ImportResult = {
  kind: ImportKind;
  committed: boolean;
  rows: PreviewRow[];
  summary: Record<RowAction, number>;
};

type Raw = Record<string, string>;

export function parseCsv(csv: string): Raw[] {
  const parsed = Papa.parse<Raw>(csv.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim().toLowerCase(),
    transform: (v) => v.trim(),
  });
  return parsed.data;
}

export async function runImport(actor: Actor, kind: string, csv: string, commit: boolean): Promise<ImportResult> {
  assertGlobal(actor, "import.run");
  if (!(IMPORT_KINDS as readonly string[]).includes(kind)) throw new ValidationError({ kind: "unknown" });
  const rows = parseCsv(csv);
  if (rows.length === 0) throw new ValidationError({ file: "empty" });
  const missing = REQUIRED_COLUMNS[kind as ImportKind].filter((c) => !(c in rows[0]));
  if (missing.length) throw new ValidationError({ columns: missing.map((c) => `missing: ${c}`) });

  const importer = { org: importOrg, employees: importEmployees, rates: importRates, balances: importBalances, accesses: importAccesses, assets: importAssets }[kind as ImportKind];

  // Preview runs exactly the same code as commit, inside a transaction that is rolled back.
  // Commit is rolled back as well when any row has errors.
  let rowsResult: PreviewRow[];
  let committed = false;
  try {
    rowsResult = await prisma.$transaction(
      async (tx) => {
        const result = await importer(tx, actor, rows);
        if (!commit || result.some((r) => r.action === "error")) throw new Rollback(result);
        return result;
      },
      { timeout: 120_000 },
    );
    committed = true;
  } catch (err) {
    if (!(err instanceof Rollback)) throw err;
    rowsResult = err.rows;
  }

  const summary: Record<RowAction, number> = { create: 0, update: 0, unchanged: 0, error: 0 };
  for (const r of rowsResult) summary[r.action]++;
  return { kind: kind as ImportKind, committed, rows: rowsResult, summary };
}

class Rollback extends Error {
  constructor(public rows: PreviewRow[]) {
    super("import_rollback");
  }
}

const REQUIRED_COLUMNS: Record<ImportKind, string[]> = {
  org: ["company", "department"],
  employees: ["work_email", "first_name", "last_name", "company", "department", "position", "employment_type"],
  rates: IMPORT_TEMPLATES.rates,
  balances: ["work_email", "days"],
  accesses: ["work_email", "system", "access_level"],
  assets: ["type", "name"],
};

const lineOf = (i: number) => i + 2; // header is line 1

// ───────────── org: companies and departments ─────────────

async function importOrg(tx: Tx, actor: Actor, rows: Raw[]): Promise<PreviewRow[]> {
  const result: PreviewRow[] = [];
  const pendingParents: { row: PreviewRow; departmentId: string; companyId: string; parentName: string }[] = [];

  for (const [i, r] of rows.entries()) {
    const row: PreviewRow = { line: lineOf(i), key: `${r.company} / ${r.department}`, action: "unchanged", errors: [] };
    result.push(row);
    if (!r.company) row.errors.push("company: required");
    if (!r.department) row.errors.push("department: required");
    if (row.errors.length) {
      row.action = "error";
      continue;
    }

    let company = await tx.company.findFirst({ where: { name: r.company, deletedAt: null } });
    if (!company) {
      if (!r.company_country) {
        row.errors.push("company_country: required for a new company");
        row.action = "error";
        continue;
      }
      company = await tx.company.create({ data: { name: r.company, country: r.company_country, createdById: actor.userId } });
      await audit(tx, actor, { action: "import.company.create", entity: "Company", entityId: company.id, after: company });
      row.action = "create";
    } else if (r.company_country && r.company_country !== company.country) {
      const before = company;
      company = await tx.company.update({ where: { id: company.id }, data: { country: r.company_country } });
      await audit(tx, actor, { action: "import.company.update", entity: "Company", entityId: company.id, before, after: company });
      row.action = "update";
    }

    let dept = await tx.department.findFirst({ where: { companyId: company.id, name: r.department, deletedAt: null } });
    if (!dept) {
      dept = await tx.department.create({ data: { companyId: company.id, name: r.department, createdById: actor.userId } });
      await audit(tx, actor, { action: "import.department.create", entity: "Department", entityId: dept.id, after: dept, departmentId: dept.id });
      row.action = "create";
    }
    if (r.parent_department) pendingParents.push({ row, departmentId: dept.id, companyId: company.id, parentName: r.parent_department });
    else if (dept.parentId) {
      await tx.department.update({ where: { id: dept.id }, data: { parentId: null } });
      if (row.action === "unchanged") row.action = "update";
    }
  }

  // second pass: parents may be defined later in the same file
  for (const p of pendingParents) {
    const parent = await tx.department.findFirst({ where: { companyId: p.companyId, name: p.parentName, deletedAt: null } });
    if (!parent) {
      p.row.errors.push(`parent_department: "${p.parentName}" not found in this company`);
      p.row.action = "error";
      continue;
    }
    if (parent.id === p.departmentId) {
      p.row.errors.push("parent_department: cannot be itself");
      p.row.action = "error";
      continue;
    }
    const dept = await tx.department.findUniqueOrThrow({ where: { id: p.departmentId } });
    if (dept.parentId !== parent.id) {
      await tx.department.update({ where: { id: dept.id }, data: { parentId: parent.id } });
      await audit(tx, actor, {
        action: "import.department.update",
        entity: "Department",
        entityId: dept.id,
        before: { parentId: dept.parentId },
        after: { parentId: parent.id },
        departmentId: dept.id,
      });
      if (p.row.action === "unchanged") p.row.action = "update";
    }
  }
  return result;
}

// ───────────── employees ─────────────

const yesNo = z
  .string()
  .optional()
  .transform((v, ctx) => {
    if (!v) return true;
    const s = v.toLowerCase();
    if (["1", "true", "yes", "так", "y"].includes(s)) return true;
    if (["0", "false", "no", "ні", "n"].includes(s)) return false;
    ctx.addIssue({ code: "custom", message: "expected yes/no" });
    return z.NEVER;
  });
const optDate = z
  .string()
  .optional()
  .refine((v) => !v || isIsoDate(v), "expected YYYY-MM-DD")
  .transform((v) => (v ? parseIsoDate(v) : null));

const employeeRow = z.object({
  work_email: z.string().toLowerCase().email(),
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  phone: z.string().optional().transform((v) => v || null),
  company: z.string().min(1),
  department: z.string().min(1),
  location: z.string().optional().transform((v) => v || null),
  position: z.string().min(1),
  manager_email: z.string().optional().transform((v) => v?.toLowerCase() || null),
  employment_type: z.enum(["employee", "contractor"]),
  hire_date: optDate,
  probation_end: optDate,
  birth_date: optDate,
  show_birthday: yesNo,
  status: z.preprocess((v) => v || "active", z.enum(["candidate", "onboarding", "active", "offboarding", "left"])),
  locale: z.preprocess((v) => v || "uk", z.enum(["uk", "en"])),
});

const COMPARED_FIELDS = [
  "firstName",
  "lastName",
  "phone",
  "companyId",
  "departmentId",
  "locationId",
  "position",
  "employmentType",
  "hireDate",
  "probationEnd",
  "birthDate",
  "showBirthday",
  "status",
  "locale",
] as const;

function sameValue(a: unknown, b: unknown) {
  if (a instanceof Date || b instanceof Date) {
    return toIsoDate(a as Date | null) === toIsoDate(b as Date | null);
  }
  return (a ?? null) === (b ?? null);
}

async function importEmployees(tx: Tx, actor: Actor, rows: Raw[]): Promise<PreviewRow[]> {
  const result: PreviewRow[] = [];
  const seenEmails = new Map<string, number>();
  const managerLinks: { row: PreviewRow; email: string; managerEmail: string | null }[] = [];

  const [companies, departments, locations] = await Promise.all([
    tx.company.findMany({ where: { deletedAt: null } }),
    tx.department.findMany({ where: { deletedAt: null } }),
    tx.location.findMany({ where: { deletedAt: null } }),
  ]);
  const companyByName = new Map(companies.map((c) => [c.name.toLowerCase(), c]));
  const locationByName = new Map(locations.map((l) => [l.name.toLowerCase(), l]));

  for (const [i, raw] of rows.entries()) {
    const row: PreviewRow = { line: lineOf(i), key: raw.work_email ?? "", action: "unchanged", errors: [] };
    result.push(row);
    const parsed = employeeRow.safeParse(raw);
    if (!parsed.success) {
      row.errors.push(...parsed.error.issues.map((iss) => `${iss.path.join(".")}: ${iss.message}`));
      row.action = "error";
      continue;
    }
    const r = parsed.data;
    row.key = r.work_email;

    const dup = seenEmails.get(r.work_email);
    if (dup) row.errors.push(`work_email: duplicate of line ${dup}`);
    seenEmails.set(r.work_email, row.line);

    const company = companyByName.get(r.company.toLowerCase());
    if (!company) row.errors.push(`company: "${r.company}" not found`);
    const dept = company && departments.find((d) => d.companyId === company.id && d.name.toLowerCase() === r.department.toLowerCase());
    if (company && !dept) row.errors.push(`department: "${r.department}" not found in ${company.name}`);
    const location = r.location ? locationByName.get(r.location.toLowerCase()) : null;
    if (r.location && !location) row.errors.push(`location: "${r.location}" not found`);
    if (r.manager_email === r.work_email) row.errors.push("manager_email: cannot be self");
    if (row.errors.length || !company || !dept) {
      row.action = "error";
      continue;
    }

    const data = {
      firstName: r.first_name,
      lastName: r.last_name,
      phone: r.phone,
      companyId: company.id,
      departmentId: dept.id,
      locationId: location?.id ?? null,
      position: r.position,
      employmentType: r.employment_type,
      hireDate: r.hire_date,
      probationEnd: r.probation_end,
      birthDate: r.birth_date,
      showBirthday: r.show_birthday,
      status: r.status,
      locale: r.locale,
    } satisfies Partial<Prisma.EmployeeUncheckedCreateInput>;

    const existing = await tx.employee.findUnique({ where: { workEmail: r.work_email } });
    if (!existing) {
      const created = await tx.employee.create({ data: { ...data, workEmail: r.work_email, createdById: actor.userId } });
      await audit(tx, actor, {
        action: "import.employee.create",
        entity: "Employee",
        entityId: created.id,
        after: created,
        departmentId: created.departmentId,
        employeeId: created.id,
      });
      row.action = "create";
    } else {
      const changed = COMPARED_FIELDS.filter((f) => !sameValue(existing[f], data[f]));
      if (existing.deletedAt || changed.length) {
        const updated = await tx.employee.update({ where: { id: existing.id }, data: { ...data, deletedAt: null } });
        await audit(tx, actor, {
          action: "import.employee.update",
          entity: "Employee",
          entityId: existing.id,
          before: existing,
          after: updated,
          departmentId: updated.departmentId,
          employeeId: existing.id,
        });
        row.action = "update";
      }
    }
    managerLinks.push({ row, email: r.work_email, managerEmail: r.manager_email });
  }

  // managers may be listed after their reports
  for (const link of managerLinks) {
    const e = await tx.employee.findUniqueOrThrow({ where: { workEmail: link.email } });
    let managerId: string | null = null;
    if (link.managerEmail) {
      const m = await tx.employee.findFirst({ where: { workEmail: link.managerEmail, deletedAt: null } });
      if (!m) {
        link.row.errors.push(`manager_email: "${link.managerEmail}" not found`);
        link.row.action = "error";
        continue;
      }
      managerId = m.id;
    }
    if (e.managerId !== managerId) {
      await tx.employee.update({ where: { id: e.id }, data: { managerId } });
      if (link.row.action === "unchanged") {
        link.row.action = "update";
        await audit(tx, actor, {
          action: "import.employee.update",
          entity: "Employee",
          entityId: e.id,
          before: { managerId: e.managerId },
          after: { managerId },
          departmentId: e.departmentId,
          employeeId: e.id,
        });
      }
    }
  }
  return result;
}

// ───────────── rates ─────────────

const rateRow = z.object({
  work_email: z.string().toLowerCase().email(),
  rate_type: z.enum(["hourly", "per_shift", "monthly"]),
  amount: z.coerce.number().positive(),
  currency: z.string().toUpperCase().length(3),
  effective_from: z.string().refine(isIsoDate, "expected YYYY-MM-DD"),
});

async function importRates(tx: Tx, actor: Actor, rows: Raw[]): Promise<PreviewRow[]> {
  const parsedRows = rows.map((raw, i) => {
    const row: PreviewRow = {
      line: lineOf(i),
      key: `${raw.work_email ?? ""} @ ${raw.effective_from ?? ""}`,
      action: "unchanged",
      errors: [],
    };
    const parsed = rateRow.safeParse(raw);
    if (!parsed.success) {
      row.errors.push(...parsed.error.issues.map((iss) => `${iss.path.join(".")}: ${iss.message}`));
      row.action = "error";
    }
    return { row, data: parsed.success ? parsed.data : null };
  });

  // apply chronologically per employee so history can be imported in any row order
  const ordered = parsedRows
    .filter((p) => p.data)
    .sort((a, b) => a.data!.work_email.localeCompare(b.data!.work_email) || a.data!.effective_from.localeCompare(b.data!.effective_from));

  for (const { row, data } of ordered) {
    const r = data!;
    const e = await tx.employee.findFirst({ where: { workEmail: r.work_email, deletedAt: null } });
    if (!e) {
      row.errors.push(`work_email: "${r.work_email}" not found`);
      row.action = "error";
      continue;
    }
    const effectiveFrom = parseIsoDate(r.effective_from);
    const existing = await tx.rateHistory.findMany({ where: { employeeId: e.id, deletedAt: null } });
    const same = existing.find((x) => x.effectiveFrom.getTime() === effectiveFrom.getTime());
    if (same) {
      const identical = same.rateType === r.rate_type && same.amount.toFixed(2) === r.amount.toFixed(2) && same.currency === r.currency;
      if (!identical) {
        row.errors.push("rate for this date already exists with different values (rates are never edited)");
        row.action = "error";
      }
      continue;
    }
    const plan = planRateAppend(existing, effectiveFrom);
    if (!plan.ok) {
      row.errors.push("effective_from: must be after the latest existing rate");
      row.action = "error";
      continue;
    }
    await appendRate(tx, actor, e, {
      rateType: r.rate_type,
      amount: r.amount,
      currency: r.currency,
      effectiveFrom: r.effective_from,
    });
    row.action = "create";
  }
  return parsedRows.map((p) => p.row);
}
