import type { PrismaClient, RequestKind } from "@prisma/client";
import { draftContent, normalizeGroups, validateTemplate, type DraftContent } from "@/server/requests/template-schema";
import type { WhoCanInitiate } from "@/server/requests/schema";
import { writeContent } from "@/server/services/templates";

/**
 * Starter templates from PRD 4 (1–4; vacation and bonus arrive with phases 2 and 3).
 * Created only when the code does not exist yet — later edits made in the constructor are never overwritten.
 */

type Def = { code: string; nameUk: string; nameEn: string; kind: RequestKind; who: WhoCanInitiate; content: (ids: Record<string, string>) => unknown };

const close = { action: "close" as const };

const DEFS: Def[] = [
  {
    code: "arm",
    nameUk: "ARM: видача і зміна доступів",
    nameEn: "ARM: grant or change access",
    kind: "access",
    who: { mode: "all" },
    content: () => ({
      fields: [
        { key: "employee", labelUk: "Співробітник", labelEn: "Employee", type: "person", required: true },
        { key: "systems", labelUk: "Системи й рівні доступу", labelEn: "Systems and access levels", type: "systems", required: true },
        { key: "reason", labelUk: "Причина", labelEn: "Reason", type: "textarea", required: false },
      ],
      steps: [
        { orderGroup: 1, nameUk: "Погодження керівником", nameEn: "Manager approval", stepType: "approve", assigneeRule: "subject_dept_head", slaDays: 2, onReject: close },
        { orderGroup: 2, nameUk: "Видача доступу", nameEn: "Grant access", stepType: "task", assigneeRule: "system_owner", slaDays: 2, onReject: close },
        {
          orderGroup: 3,
          nameUk: "Підтвердження ініціатором",
          nameEn: "Confirmation by initiator",
          stepType: "approve",
          assigneeRule: "initiator",
          slaDays: 2,
          onReject: { action: "return", group: 2 },
        },
      ],
    }),
  },
  {
    code: "offboarding",
    nameUk: "Офбординг",
    nameEn: "Offboarding",
    kind: "offboarding",
    who: { mode: "roles", roleCodes: ["dept_head", "hr", "ceo"] },
    content: () => ({
      fields: [
        { key: "employee", labelUk: "Співробітник", labelEn: "Employee", type: "person", required: true },
        { key: "last_day", labelUk: "Останній робочий день", labelEn: "Last working day", type: "date", required: true },
        { key: "reason", labelUk: "Причина", labelEn: "Reason", type: "textarea", required: false },
      ],
      steps: [
        { orderGroup: 1, nameUk: "Підтвердження дати керівником", nameEn: "Manager confirms the date", stepType: "approve", assigneeRule: "subject_dept_head", slaDays: 1, onReject: close },
        { orderGroup: 2, nameUk: "Відкликання доступу", nameEn: "Revoke access", stepType: "task", assigneeRule: "system_owner", slaDays: 1, onReject: close },
        {
          orderGroup: 2,
          nameUk: "Прийом техніки",
          nameEn: "Collect equipment",
          stepType: "task",
          assigneeRule: "role_first_free",
          assigneeValue: "office_admin",
          slaDays: 2,
          checklist: [
            { labelUk: "Ноутбук", labelEn: "Laptop" },
            { labelUk: "Телефон / гарнітура", labelEn: "Phone / headset" },
            { labelUk: "Перепустка", labelEn: "Badge" },
          ],
          onReject: close,
        },
        { orderGroup: 3, nameUk: "Закриття розрахунку", nameEn: "Final settlement", stepType: "task", assigneeRule: "role_first_free", assigneeValue: "finance", slaDays: 3, onReject: close },
      ],
    }),
  },
  {
    code: "hiring",
    nameUk: "Пошук працівника",
    nameEn: "Hiring request",
    kind: "hiring",
    who: { mode: "roles", roleCodes: ["dept_head", "ceo"] },
    content: () => ({
      fields: [
        { key: "position", labelUk: "Посада", labelEn: "Position", type: "text", required: true },
        { key: "department", labelUk: "Відділ", labelEn: "Department", type: "select", options: { source: "departments" }, required: true },
        { key: "budget", labelUk: "Бюджет або ставка", labelEn: "Budget or rate", type: "number", required: true },
        { key: "desired_date", labelUk: "Бажана дата виходу", labelEn: "Desired start date", type: "date", required: true },
        {
          key: "employment_type",
          labelUk: "Тип зайнятості",
          labelEn: "Employment type",
          type: "select",
          options: [
            { value: "employee", labelUk: "Штатний", labelEn: "Employee" },
            { value: "contractor", labelUk: "Contractor", labelEn: "Contractor" },
          ],
          required: true,
        },
        { key: "requirements", labelUk: "Вимоги до кандидата", labelEn: "Requirements", type: "textarea", required: false },
        { key: "candidate_first_name", labelUk: "Ім'я кандидата", labelEn: "Candidate first name", type: "text", required: true },
        { key: "candidate_last_name", labelUk: "Прізвище кандидата", labelEn: "Candidate last name", type: "text", required: true },
        { key: "candidate_email", labelUk: "Робочий email кандидата", labelEn: "Candidate work email", type: "text", required: true },
      ],
      steps: [
        { orderGroup: 1, nameUk: "Погодження CEO", nameEn: "CEO approval", stepType: "approve", assigneeRule: "role_first_free", assigneeValue: "ceo", slaDays: 2, onReject: close },
        { orderGroup: 2, nameUk: "Старт пошуку", nameEn: "Start the search", stepType: "task", assigneeRule: "role_first_free", assigneeValue: "hr", slaDays: 2, onReject: close },
        {
          orderGroup: 3,
          nameUk: "Кандидат обраний",
          nameEn: "Candidate selected",
          stepType: "fill",
          assigneeRule: "role_first_free",
          assigneeValue: "hr",
          slaDays: 20,
          requiredFields: ["candidate_first_name", "candidate_last_name", "candidate_email"],
          onReject: close,
        },
      ],
    }),
  },
  {
    code: "onboarding",
    nameUk: "Онбординг",
    nameEn: "Onboarding",
    kind: "onboarding",
    who: { mode: "roles", roleCodes: ["hr", "dept_head", "ceo"] },
    content: (ids) => ({
      fields: [
        { key: "employee", labelUk: "Новий співробітник", labelEn: "New employee", type: "person", required: true },
        { key: "start_date", labelUk: "Перший робочий день", labelEn: "First working day", type: "date", required: true },
        { key: "notes", labelUk: "Нотатки", labelEn: "Notes", type: "textarea", required: false },
      ],
      steps: [
        { orderGroup: 1, nameUk: "NDA", nameEn: "NDA", stepType: "document", documentType: "nda", assigneeRule: "role_first_free", assigneeValue: "legal", slaDays: 2, onReject: close },
        {
          orderGroup: 1,
          nameUk: "Створення профілю",
          nameEn: "Create the profile",
          stepType: "fill",
          assigneeRule: "role_first_free",
          assigneeValue: "hr",
          slaDays: 2,
          requiredFields: ["start_date"],
          onReject: close,
        },
        {
          orderGroup: 2,
          nameUk: "Доступи за шаблоном посади",
          nameEn: "Access by position template",
          stepType: "child_request",
          childRequestTypeId: ids.arm,
          assigneeRule: "role_first_free",
          assigneeValue: "hr",
          slaDays: 3,
          onReject: close,
        },
        {
          orderGroup: 2,
          nameUk: "Видача техніки",
          nameEn: "Hand out equipment",
          stepType: "task",
          assigneeRule: "role_first_free",
          assigneeValue: "office_admin",
          slaDays: 3,
          checklist: [
            { labelUk: "Ноутбук", labelEn: "Laptop" },
            { labelUk: "Гарнітура", labelEn: "Headset" },
          ],
          onReject: close,
        },
        { orderGroup: 3, nameUk: "Вступна зустріч", nameEn: "Welcome meeting", stepType: "task", assigneeRule: "subject_dept_head", slaDays: 3, onReject: close },
      ],
    }),
  },
];

DEFS.push({
  code: "absence",
  nameUk: "Відпустка або відсутність",
  nameEn: "Time off",
  kind: "absence",
  who: { mode: "all" },
  content: () => ({
    fields: [
      { key: "absence_type", labelUk: "Тип відсутності", labelEn: "Type", type: "select", options: { source: "absence_types" }, required: true },
      { key: "dates", labelUk: "Дати", labelEn: "Dates", type: "date_range", required: true },
      {
        key: "half_day",
        labelUk: "Пів дня",
        labelEn: "Half day",
        type: "select",
        options: [
          { value: "no", labelUk: "Ні", labelEn: "No" },
          { value: "yes", labelUk: "Так, пів дня", labelEn: "Yes, half a day" },
        ],
        required: false,
      },
      { key: "document", labelUk: "Документ (лікарняний тощо)", labelEn: "Document (sick note etc.)", type: "file", required: false },
      { key: "comment", labelUk: "Коментар", labelEn: "Comment", type: "textarea", required: false },
    ],
    // PTO policy (phase 6): approved only when both the direct manager and Head of People confirm — two different people
    steps: [
      { orderGroup: 1, nameUk: "Погодження прямим керівником", nameEn: "Direct manager approval", stepType: "approve", assigneeRule: "subject_manager", slaDays: 2, onReject: close },
      { orderGroup: 1, nameUk: "Погодження Head of People", nameEn: "Head of People approval", stepType: "approve", assigneeRule: "role_first_free", assigneeValue: "head_of_people", slaDays: 2, onReject: close },
    ],
  }),
});

DEFS.push({
  code: "bonus",
  nameUk: "Старт премії",
  nameEn: "Bonus payout",
  kind: "bonus",
  who: { mode: "roles", roleCodes: ["dept_head", "ceo", "finance"] },
  content: () => ({
    fields: [
      { key: "employee", labelUk: "Співробітник", labelEn: "Employee", type: "person", required: true },
      { key: "amount", labelUk: "Сума (з CS incentive)", labelEn: "Amount (from CS incentive)", type: "number", required: true },
      { key: "currency", labelUk: "Валюта (порожньо — як у ставці)", labelEn: "Currency (empty = as the rate)", type: "text", required: false },
      { key: "period", labelUk: "Період (РРРР-ММ)", labelEn: "Period (YYYY-MM)", type: "text", required: true },
      { key: "reason", labelUk: "Підстава", labelEn: "Reason", type: "textarea", required: true },
      {
        key: "source",
        labelUk: "Джерело",
        labelEn: "Source",
        type: "select",
        options: [
          { value: "cs_incentive", labelUk: "CS incentive", labelEn: "CS incentive" },
          { value: "manual", labelUk: "Вручну", labelEn: "Manual" },
        ],
        required: false,
      },
    ],
    steps: [
      { orderGroup: 1, nameUk: "Погодження керівником", nameEn: "Manager approval", stepType: "approve", assigneeRule: "subject_dept_head", slaDays: 2, onReject: close },
      { orderGroup: 2, nameUk: "Погодження CEO", nameEn: "CEO approval", stepType: "approve", assigneeRule: "role_first_free", assigneeValue: "ceo", slaDays: 2, onReject: close },
      { orderGroup: 3, nameUk: "Фінанси: включити у виплату", nameEn: "Finance: include in payout", stepType: "task", assigneeRule: "role_first_free", assigneeValue: "finance", slaDays: 3, onReject: close },
    ],
  }),
});

export async function seedStarterTemplates(prisma: PrismaClient) {
  const ids: Record<string, string> = {};
  for (const def of DEFS) {
    const existing = await prisma.requestType.findUnique({ where: { code: def.code } });
    if (existing) {
      ids[def.code] = existing.id;
      continue;
    }
    const content: DraftContent = normalizeGroups(draftContent.parse(def.content(ids)));
    const errors = await validateTemplate(prisma, def.kind, content);
    if (errors.length) throw new Error(`starter template ${def.code} is invalid: ${errors.join("; ")}`);
    const type = await prisma.requestType.create({
      data: { code: def.code, nameUk: def.nameUk, nameEn: def.nameEn, kind: def.kind, whoCanInitiate: def.who },
    });
    const version = await prisma.requestTypeVersion.create({
      data: { requestTypeId: type.id, version: 1, status: "published", publishedAt: new Date() },
    });
    await writeContent(prisma, version.id, content);
    await prisma.requestType.update({ where: { id: type.id }, data: { currentVersionId: version.id } });
    ids[def.code] = type.id;
  }
  return ids;
}

/**
 * Phase 6: the absence template of phase 2 (one step "department head") gets a new published version with the two
 * approvals. A template already edited in the constructor is left alone.
 */
export async function upgradeStarterTemplates(prisma: PrismaClient) {
  const def = DEFS.find((d) => d.code === "absence")!;
  const type = await prisma.requestType.findUnique({ where: { code: "absence" }, include: { currentVersion: { include: { steps: true } } } });
  const steps = type?.currentVersion?.steps ?? [];
  if (!type?.currentVersion || steps.length !== 1 || steps[0].assigneeRule !== "subject_dept_head") return false;
  const content: DraftContent = normalizeGroups(draftContent.parse(def.content({})));
  const errors = await validateTemplate(prisma, def.kind, content);
  if (errors.length) throw new Error(`absence template upgrade is invalid: ${errors.join("; ")}`);
  const last = await prisma.requestTypeVersion.findFirst({ where: { requestTypeId: type.id }, orderBy: { version: "desc" } });
  const version = await prisma.requestTypeVersion.create({
    data: { requestTypeId: type.id, version: (last?.version ?? 1) + 1, status: "published", publishedAt: new Date() },
  });
  await writeContent(prisma, version.id, content);
  await prisma.requestTypeVersion.update({ where: { id: type.currentVersion.id }, data: { status: "archived" } });
  await prisma.requestType.update({ where: { id: type.id }, data: { currentVersionId: version.id } });
  return true;
}
