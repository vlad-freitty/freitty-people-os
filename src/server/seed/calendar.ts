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

export const STARTER_ABSENCE_TYPES = [
  { code: "vacation", nameUk: "Відпустка", nameEn: "Vacation", color: "#1f7a4d", paid: true, deductsBalance: true, requiresDocument: false, requiresApproval: true, allowHalfDay: false },
  { code: "sick_leave", nameUk: "Лікарняний", nameEn: "Sick leave", color: "#b45309", paid: true, deductsBalance: false, requiresDocument: true, requiresApproval: false, allowHalfDay: false },
  { code: "unpaid", nameUk: "За свій рахунок", nameEn: "Unpaid leave", color: "#4a4852", paid: false, deductsBalance: false, requiresDocument: false, requiresApproval: true, allowHalfDay: false },
  { code: "day_off", nameUk: "Day off", nameEn: "Day off", color: "#2563eb", paid: true, deductsBalance: true, requiresDocument: false, requiresApproval: true, allowHalfDay: true, maxDays: 1 },
];

export async function ensureAbsenceTypes(prisma: PrismaClient) {
  for (const t of STARTER_ABSENCE_TYPES) {
    if (await prisma.absenceType.findUnique({ where: { code: t.code } })) continue;
    await prisma.absenceType.create({ data: t });
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
