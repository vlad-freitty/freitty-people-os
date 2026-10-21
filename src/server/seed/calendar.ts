import type { LayerEffect, PrismaClient } from "@prisma/client";

/**
 * Reference data for phase 2: system layers, starter absence types and the "FREITTY стандарт" policy (PRD 5).
 * Holiday layers are demo data — Legal confirms the list and whether Ukrainian holidays are non-working under
 * martial law (phase 2 plan, decision 3: the Ukrainian layer is seeded as informational).
 * Everything is created only when missing.
 */

const d = (s: string) => new Date(`${s}T00:00:00Z`);

export async function ensureSystemLayers(prisma: PrismaClient) {
  for (const [systemKind, nameUk, nameEn, color] of [
    ["birthdays", "Дні народження", "Birthdays", "#c2410c"],
    ["work_anniversaries", "Річниці роботи", "Work anniversaries", "#7c3aed"],
  ] as const) {
    if (await prisma.calendarLayer.findUnique({ where: { systemKind } })) continue;
    await prisma.calendarLayer.create({ data: { systemKind, nameUk, nameEn, color, effect: "informational", source: "system", visibility: "all" } });
  }
}

/**
 * PTO types from the "PTO and Benefits Policy" (phase 6). Day off is not in the policy but stays (Vlad, 2026-10-21);
 * it no longer draws from the vacation pool. Remote Day is a working day (countsAsWorking).
 */
export const STARTER_ABSENCE_TYPES = [
  { code: "vacation", nameUk: "Оплачувана відпустка", nameEn: "Paid Vacation", color: "#1f7a4d", paid: true, deductsBalance: true, requiresDocument: false, requiresApproval: true, allowHalfDay: false },
  { code: "wellness_day", nameUk: "Wellness Day (день відновлення)", nameEn: "Wellness Day", color: "#0d9488", paid: true, deductsBalance: true, requiresDocument: false, requiresApproval: true, allowHalfDay: false, maxDays: 1 },
  { code: "remote_day", nameUk: "Віддалений день", nameEn: "Remote Day", color: "#0052b4", paid: true, deductsBalance: true, requiresDocument: false, requiresApproval: true, allowHalfDay: false, countsAsWorking: true },
  { code: "sick_leave", nameUk: "Оплачуваний лікарняний", nameEn: "Paid Sick Leave", color: "#b45309", paid: true, deductsBalance: true, requiresDocument: false, requiresApproval: false, allowHalfDay: false },
  { code: "specific_reason", nameUk: "Оплачувана відпустка з особливої причини", nameEn: "Paid Leave — Specific Reason", color: "#7c3aed", paid: true, deductsBalance: false, requiresDocument: false, requiresApproval: true, allowHalfDay: false, maxDays: 3 },
  { code: "unpaid", nameUk: "Відпустка за свій рахунок", nameEn: "Unpaid Vacation", color: "#4a4852", paid: false, deductsBalance: true, requiresDocument: false, requiresApproval: true, allowHalfDay: false, maxDays: 3 },
  { code: "day_off", nameUk: "Day off", nameEn: "Day off", color: "#2563eb", paid: true, deductsBalance: false, requiresDocument: false, requiresApproval: true, allowHalfDay: true, maxDays: 1 },
];

/** Names and flags the phase 2 seed used — a type still carrying them is upgraded, an edited one is left alone. */
const PHASE2_TYPES: Record<string, { nameUk: string; nameEn: string; deductsBalance: boolean; requiresDocument: boolean }> = {
  vacation: { nameUk: "Відпустка", nameEn: "Vacation", deductsBalance: true, requiresDocument: false },
  sick_leave: { nameUk: "Лікарняний", nameEn: "Sick leave", deductsBalance: false, requiresDocument: true },
  unpaid: { nameUk: "За свій рахунок", nameEn: "Unpaid leave", deductsBalance: false, requiresDocument: false },
  day_off: { nameUk: "Day off", nameEn: "Day off", deductsBalance: true, requiresDocument: false },
};

export async function ensureAbsenceTypes(prisma: PrismaClient) {
  for (const t of STARTER_ABSENCE_TYPES) {
    const existing = await prisma.absenceType.findUnique({ where: { code: t.code } });
    if (!existing) {
      await prisma.absenceType.create({ data: t });
      continue;
    }
    const old = PHASE2_TYPES[t.code];
    if (
      old &&
      existing.nameUk === old.nameUk &&
      (existing.nameEn ?? "") === old.nameEn &&
      existing.deductsBalance === old.deductsBalance &&
      existing.requiresDocument === old.requiresDocument
    ) {
      await prisma.absenceType.update({ where: { id: existing.id }, data: t });
    }
  }
}

/** "FREITTY стандарт" from PRD 5: 10 days upfront from the hire date, expires at the anniversary, no carryover. */
export const FREITTY_STANDARD = {
  name: "FREITTY стандарт",
  daysPerPeriod: 10,
  accrual: "upfront",
  periodStart: "hire_date",
  expiry: "end_of_period",
  carryoverMax: 0,
  availableAfterDays: 0,
  allowNegative: false,
  countDays: "working",
} as const;

type PolicySeed = Omit<typeof FREITTY_STANDARD, "periodStart" | "availableAfterDays" | "daysPerPeriod" | "name" | "accrual"> & {
  name: string;
  daysPerPeriod: number;
  accrual: "upfront" | "monthly";
  periodStart: "hire_date" | "jan_1" | "month";
  availableAfterDays: number;
};

/**
 * Default policy per PTO type (phase 6) — base values from the PTO & Benefits Guide (Individual Contributor, year 1).
 * No accrual over time, no carryover, unused days expire at the end of the period; grades and years of service are
 * configured by the superadmin with more policies. Created only when the type has no policy yet.
 */
export const DEFAULT_PTO_POLICIES: Record<string, PolicySeed> = {
  vacation: { ...FREITTY_STANDARD, availableAfterDays: 365 },
  wellness_day: { ...FREITTY_STANDARD, name: "Wellness Day — базова", daysPerPeriod: 1, availableAfterDays: 0 },
  remote_day: { ...FREITTY_STANDARD, name: "Remote Day — базова", daysPerPeriod: 1, periodStart: "month", availableAfterDays: 0 },
  sick_leave: { ...FREITTY_STANDARD, name: "Paid Sick Leave — базова", daysPerPeriod: 2, availableAfterDays: 0 },
  unpaid: { ...FREITTY_STANDARD, name: "Unpaid Vacation — базова", daysPerPeriod: 5, availableAfterDays: 182 },
};

export async function ensurePtoPolicies(prisma: PrismaClient) {
  for (const [code, data] of Object.entries(DEFAULT_PTO_POLICIES)) {
    const type = await prisma.absenceType.findUnique({ where: { code } });
    if (!type) continue;
    if (await prisma.absencePolicy.findFirst({ where: { absenceTypeId: type.id, deletedAt: null } })) {
      // the phase 2 standard policy became the vacation default in the migration: Paid Vacation needs one year (policy)
      if (code === "vacation") {
        await prisma.absencePolicy.updateMany({ where: { name: FREITTY_STANDARD.name, absenceTypeId: type.id, availableAfterDays: 0 }, data: { availableAfterDays: 365 } });
      }
      continue;
    }
    await prisma.absencePolicy.create({ data: { ...data, absenceTypeId: type.id, isDefault: true } });
  }
}

type Holiday = [date: string, uk: string, en: string, yearly?: boolean];

const UA_HOLIDAYS: Holiday[] = [
  ["2026-01-01", "Новий рік", "New Year", true],
  ["2026-03-08", "Міжнародний жіночий день", "International Women's Day", true],
  ["2026-04-12", "Великдень", "Easter"],
  ["2026-05-01", "День праці", "Labour Day", true],
  ["2026-05-08", "День пам'яті та перемоги", "Day of Remembrance and Victory", true],
  ["2026-05-31", "Трійця", "Trinity"],
  ["2026-06-28", "День Конституції", "Constitution Day", true],
  ["2026-07-15", "День Української Державності", "Statehood Day", true],
  ["2026-08-24", "День Незалежності", "Independence Day", true],
  ["2026-10-01", "День захисників і захисниць", "Defenders Day", true],
  ["2026-12-25", "Різдво", "Christmas", true],
  ["2027-05-02", "Великдень", "Easter"],
  ["2027-06-20", "Трійця", "Trinity"],
];

const US_FEDERAL: Holiday[] = [
  ["2026-01-01", "Новий рік", "New Year's Day"],
  ["2026-01-19", "День Мартіна Лютера Кінга", "Martin Luther King Jr. Day"],
  ["2026-02-16", "День президентів", "Presidents' Day"],
  ["2026-05-25", "День пам'яті", "Memorial Day"],
  ["2026-06-19", "Джуніті", "Juneteenth"],
  ["2026-07-03", "День незалежності (вихідний)", "Independence Day (observed)"],
  ["2026-09-07", "День праці", "Labor Day"],
  ["2026-10-12", "День Колумба", "Columbus Day"],
  ["2026-11-11", "День ветеранів", "Veterans Day"],
  ["2026-11-26", "День подяки", "Thanksgiving Day"],
  ["2026-12-25", "Різдво", "Christmas Day"],
  ["2027-01-01", "Новий рік", "New Year's Day"],
  ["2027-01-18", "День Мартіна Лютера Кінга", "Martin Luther King Jr. Day"],
  ["2027-02-15", "День президентів", "Presidents' Day"],
  ["2027-05-31", "День пам'яті", "Memorial Day"],
  ["2027-06-18", "Джуніті (вихідний)", "Juneteenth (observed)"],
  ["2027-07-05", "День незалежності (вихідний)", "Independence Day (observed)"],
  ["2027-09-06", "День праці", "Labor Day"],
  ["2027-10-11", "День Колумба", "Columbus Day"],
  ["2027-11-11", "День ветеранів", "Veterans Day"],
  ["2027-11-25", "День подяки", "Thanksgiving Day"],
  ["2027-12-24", "Різдво (вихідний)", "Christmas Day (observed)"],
];

/** Creates a holiday layer with its events and assignment, if a layer with that name does not exist yet. */
export async function ensureHolidayLayer(
  prisma: PrismaClient,
  def: { nameUk: string; nameEn: string; color: string; effect: LayerEffect; holidays: Holiday[]; assign: { targetType: "company" | "location"; targetId: string }[] },
) {
  const existing = await prisma.calendarLayer.findFirst({ where: { nameUk: def.nameUk, deletedAt: null } });
  if (existing) return existing.id;
  const layer = await prisma.calendarLayer.create({
    data: { nameUk: def.nameUk, nameEn: def.nameEn, color: def.color, effect: def.effect, visibility: "assigned_only" },
  });
  await prisma.calendarEvent.createMany({
    data: def.holidays.map(([date, uk, en, yearly]) => ({ layerId: layer.id, titleUk: uk, titleEn: en, date: d(date), recurrence: yearly ? "yearly" : "none" })),
  });
  await prisma.layerAssignment.createMany({ data: def.assign.map((a) => ({ layerId: layer.id, ...a })) });
  return layer.id;
}

export const HOLIDAYS = { UA_HOLIDAYS, US_FEDERAL };
