import { z } from "zod";
import { isIsoDate, parseIsoDate } from "@/lib/dates";
import { audit } from "@/server/audit";
import type { Actor } from "@/server/authz/actor";
import type { Tx } from "@/server/db";
import { round1, syncTypeBalance } from "@/server/absences/balance";

/** Initial import kinds added in phase 2 (PRD 7): starting balances, granted access, equipment. */

export type Raw = Record<string, string>;
export type RowAction = "create" | "update" | "unchanged" | "error";
export type PreviewRow = { line: number; key: string; action: RowAction; errors: string[] };

export const lineOf = (i: number) => i + 2; // header is line 1

function issues(err: z.ZodError) {
  return err.issues.map((iss) => `${iss.path.join(".")}: ${iss.message}`);
}

const today = () => {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
};

// ───────────── starting balances (manual_adjustment «початковий залишок») ─────────────

const balanceRow = z.object({
  work_email: z.string().toLowerCase().email(),
  days: z.coerce.number().min(-366).max(366),
  comment: z.string().optional(),
  /** phase 6: code of the absence type (empty = vacation) */
  absence_type: z.string().trim().optional(),
});

/** One starting balance per person and absence type (key = person + type). Re-importing the same number changes nothing; another number is an error. */
export async function importBalances(tx: Tx, actor: Actor, rows: Raw[]): Promise<PreviewRow[]> {
  const result: PreviewRow[] = [];
  for (const [i, raw] of rows.entries()) {
    const row: PreviewRow = { line: lineOf(i), key: raw.work_email ?? "", action: "unchanged", errors: [] };
    result.push(row);
    const parsed = balanceRow.safeParse(raw);
    if (!parsed.success) {
      row.errors.push(...issues(parsed.error));
      row.action = "error";
      continue;
    }
    const r = parsed.data;
    const e = await tx.employee.findFirst({ where: { workEmail: r.work_email, deletedAt: null } });
    if (!e) {
      row.errors.push(`work_email: "${r.work_email}" not found`);
      row.action = "error";
      continue;
    }
    const typeCode = r.absence_type || "vacation";
    const type = await tx.absenceType.findFirst({ where: { code: typeCode, deletedAt: null } });
    if (!type) {
      row.errors.push(`absence_type: "${typeCode}" not found`);
      row.action = "error";
      continue;
    }
    // vacation keeps the phase 2 key, so a file imported before phase 6 is still recognised
    const key = typeCode === "vacation" ? `import-initial:${e.id}` : `import-initial:${e.id}:${typeCode}`;
    const existing = await tx.absenceLedgerEntry.findUnique({ where: { idempotencyKey: key } });
    if (existing) {
      if (round1(Number(existing.amount)) !== round1(r.days)) {
        row.errors.push("starting balance already imported with a different value — use a manual adjustment");
        row.action = "error";
      }
      continue;
    }
    const { policy } = await syncTypeBalance(tx, e.id, type.id);
    const balance = policy ? await tx.absenceBalance.findFirst({ where: { employeeId: e.id, policyId: policy.id }, orderBy: { periodStart: "desc" } }) : null;
    if (!policy || !balance) {
      row.errors.push(policy ? "no hire date — the balance period is unknown" : "no absence policy for this person");
      row.action = "error";
      continue;
    }
    const entry = await tx.absenceLedgerEntry.create({
      data: {
        balanceId: balance.id,
        type: "manual_adjustment",
        amount: round1(r.days),
        date: today(),
        comment: r.comment || "початковий залишок",
        idempotencyKey: key,
        createdById: actor.userId,
      },
    });
    await audit(tx, actor, { action: "import.balance", entity: "AbsenceLedgerEntry", entityId: entry.id, after: { days: r.days }, departmentId: e.departmentId, employeeId: e.id });
    row.action = "create";
  }
  return result;
}

// ───────────── granted access ─────────────

const accessRow = z.object({
  work_email: z.string().toLowerCase().email(),
  system: z.string().min(1),
  access_level: z.string().min(1).max(50),
  granted_at: z.string().optional().refine((v) => !v || isIsoDate(v), "expected YYYY-MM-DD"),
});

/** Key: (person, system). The same level again changes nothing; a new level replaces the active grant. */
export async function importAccesses(tx: Tx, actor: Actor, rows: Raw[]): Promise<PreviewRow[]> {
  const result: PreviewRow[] = [];
  const systems = await tx.system.findMany({ where: { deletedAt: null } });
  for (const [i, raw] of rows.entries()) {
    const row: PreviewRow = { line: lineOf(i), key: `${raw.work_email ?? ""} · ${raw.system ?? ""}`, action: "unchanged", errors: [] };
    result.push(row);
    const parsed = accessRow.safeParse(raw);
    if (!parsed.success) {
      row.errors.push(...issues(parsed.error));
      row.action = "error";
      continue;
    }
    const r = parsed.data;
    const e = await tx.employee.findFirst({ where: { workEmail: r.work_email, deletedAt: null } });
    const system = systems.find((s) => s.name.toLowerCase() === r.system.toLowerCase());
    if (!e) row.errors.push(`work_email: "${r.work_email}" not found`);
    if (!system) row.errors.push(`system: "${r.system}" not found`);
    if (!e || !system) {
      row.action = "error";
      continue;
    }
    const active = await tx.accessGrant.findFirst({ where: { employeeId: e.id, systemId: system.id, revokedAt: null } });
    if (active?.accessLevel === r.access_level) continue;
    const now = new Date();
    if (active) await tx.accessGrant.update({ where: { id: active.id }, data: { revokedAt: now } });
    const grant = await tx.accessGrant.create({
      data: { employeeId: e.id, systemId: system.id, accessLevel: r.access_level, grantedAt: r.granted_at ? parseIsoDate(r.granted_at) : now, createdById: actor.userId },
    });
    await audit(tx, actor, { action: "import.access", entity: "AccessGrant", entityId: grant.id, after: { system: system.name, level: r.access_level }, departmentId: e.departmentId, employeeId: e.id });
    row.action = active ? "update" : "create";
  }
  return result;
}

// ───────────── equipment and licenses ─────────────

const assetRow = z.object({
  type: z.enum(["laptop", "phone", "license", "other"]),
  name: z.string().min(1).max(150),
  serial_or_seat: z.string().optional().transform((v) => v || null),
  monthly_cost: z.preprocess((v) => (v === "" || v === undefined ? null : v), z.coerce.number().min(0).nullable()),
  currency: z.string().optional().transform((v) => (v ? v.toUpperCase() : null)),
  assigned_to_email: z.string().optional().transform((v) => v?.toLowerCase() || null),
  assigned_at: z.string().optional().refine((v) => !v || isIsoDate(v), "expected YYYY-MM-DD"),
});

/** Key: (type, name, serial_or_seat). Rows without a serial are always new items. */
export async function importAssets(tx: Tx, actor: Actor, rows: Raw[]): Promise<PreviewRow[]> {
  const result: PreviewRow[] = [];
  for (const [i, raw] of rows.entries()) {
    const row: PreviewRow = { line: lineOf(i), key: `${raw.name ?? ""} ${raw.serial_or_seat ?? ""}`.trim(), action: "unchanged", errors: [] };
    result.push(row);
    const parsed = assetRow.safeParse(raw);
    if (!parsed.success) {
      row.errors.push(...issues(parsed.error));
      row.action = "error";
      continue;
    }
    const r = parsed.data;
    if (r.monthly_cost != null && (!r.currency || r.currency.length !== 3)) {
      row.errors.push("currency: required with monthly_cost");
      row.action = "error";
      continue;
    }
    const holder = r.assigned_to_email ? await tx.employee.findFirst({ where: { workEmail: r.assigned_to_email, deletedAt: null } }) : null;
    if (r.assigned_to_email && !holder) {
      row.errors.push(`assigned_to_email: "${r.assigned_to_email}" not found`);
      row.action = "error";
      continue;
    }
    const data = {
      type: r.type,
      name: r.name,
      serialOrSeat: r.serial_or_seat,
      monthlyCost: r.monthly_cost,
      currency: r.monthly_cost != null ? r.currency : null,
      assignedToId: holder?.id ?? null,
      assignedAt: holder ? (r.assigned_at ? parseIsoDate(r.assigned_at) : new Date()) : null,
      returnedAt: null,
    };
    const existing = r.serial_or_seat ? await tx.asset.findFirst({ where: { type: r.type, name: r.name, serialOrSeat: r.serial_or_seat, deletedAt: null } }) : null;
    if (existing) {
      const sameHolder = existing.assignedToId === data.assignedToId && !existing.returnedAt;
      const sameCost = (existing.monthlyCost == null ? null : Number(existing.monthlyCost)) === data.monthlyCost;
      if (sameHolder && sameCost) continue;
      const after = await tx.asset.update({ where: { id: existing.id }, data: { ...data, assignedAt: sameHolder ? existing.assignedAt : data.assignedAt } });
      await audit(tx, actor, { action: "import.asset.update", entity: "Asset", entityId: existing.id, before: existing, after, employeeId: holder?.id ?? null });
      row.action = "update";
    } else {
      const created = await tx.asset.create({ data: { ...data, createdById: actor.userId } });
      await audit(tx, actor, { action: "import.asset", entity: "Asset", entityId: created.id, after: created, employeeId: holder?.id ?? null, departmentId: holder?.departmentId ?? null });
      row.action = "create";
    }
  }
  return result;
}
