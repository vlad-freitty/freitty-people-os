-- Phase 6: one balance per absence type, policy assignments per type, grade, direct-manager rule, Remote Days.
-- Existing policies become policies of the "vacation" type; existing company / department / employee
-- assignments move into absence_policy_assignment; balances get the type of their policy.

-- CreateEnum
CREATE TYPE "EmployeeGrade" AS ENUM ('senior_management', 'middle_management', 'first_line_management', 'individual_contributor');

-- AlterEnum
ALTER TYPE "AssigneeRule" ADD VALUE 'subject_manager';

-- AlterEnum
ALTER TYPE "PeriodStart" ADD VALUE 'month';

-- AlterTable
ALTER TABLE "absence_type" ADD COLUMN "countsAsWorking" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "employee" ADD COLUMN "grade" "EmployeeGrade";

-- Data: a "vacation" type must exist when there are policies to attach to it
INSERT INTO "absence_type" ("id", "code", "nameUk", "nameEn", "color", "paid", "deductsBalance", "requiresDocument", "requiresApproval", "allowHalfDay", "createdAt", "updatedAt")
SELECT gen_random_uuid(), 'vacation', 'Оплачувана відпустка', 'Paid Vacation', '#1f7a4d', true, true, false, true, false, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM "absence_type" WHERE "code" = 'vacation')
  AND EXISTS (SELECT 1 FROM "absence_policy");

-- AlterTable: policies get a type; the policy used by most companies becomes the default
ALTER TABLE "absence_policy" ADD COLUMN "absenceTypeId" UUID,
ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false;

UPDATE "absence_policy" SET "absenceTypeId" = (SELECT "id" FROM "absence_type" WHERE "code" = 'vacation');

UPDATE "absence_policy" SET "isDefault" = true
WHERE "id" = (
  SELECT "absencePolicyId" FROM "company" WHERE "absencePolicyId" IS NOT NULL
  GROUP BY "absencePolicyId" ORDER BY count(*) DESC, "absencePolicyId" LIMIT 1
);

ALTER TABLE "absence_policy" ALTER COLUMN "absenceTypeId" SET NOT NULL;

-- CreateTable
CREATE TABLE "absence_policy_assignment" (
    "id" UUID NOT NULL,
    "policyId" UUID NOT NULL,
    "absenceTypeId" UUID NOT NULL,
    "companyId" UUID,
    "departmentId" UUID,
    "employeeId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" UUID,

    CONSTRAINT "absence_policy_assignment_pkey" PRIMARY KEY ("id")
);

-- Data: old single assignments → assignments of the vacation type
INSERT INTO "absence_policy_assignment" ("id", "policyId", "absenceTypeId", "companyId")
SELECT gen_random_uuid(), c."absencePolicyId", p."absenceTypeId", c."id"
FROM "company" c JOIN "absence_policy" p ON p."id" = c."absencePolicyId";

INSERT INTO "absence_policy_assignment" ("id", "policyId", "absenceTypeId", "departmentId")
SELECT gen_random_uuid(), d."absencePolicyId", p."absenceTypeId", d."id"
FROM "department" d JOIN "absence_policy" p ON p."id" = d."absencePolicyId";

INSERT INTO "absence_policy_assignment" ("id", "policyId", "absenceTypeId", "employeeId")
SELECT gen_random_uuid(), e."absencePolicyId", p."absenceTypeId", e."id"
FROM "employee" e JOIN "absence_policy" p ON p."id" = e."absencePolicyId";

-- AlterTable: balances get the type of their policy
ALTER TABLE "absence_balance" ADD COLUMN "absenceTypeId" UUID;
UPDATE "absence_balance" b SET "absenceTypeId" = p."absenceTypeId" FROM "absence_policy" p WHERE p."id" = b."policyId";
ALTER TABLE "absence_balance" ALTER COLUMN "absenceTypeId" SET NOT NULL;

-- DropForeignKey / DropColumn: the single assignment columns are replaced by absence_policy_assignment
ALTER TABLE "company" DROP CONSTRAINT "company_absencePolicyId_fkey";
ALTER TABLE "department" DROP CONSTRAINT "department_absencePolicyId_fkey";
ALTER TABLE "employee" DROP CONSTRAINT "employee_absencePolicyId_fkey";
ALTER TABLE "company" DROP COLUMN "absencePolicyId";
ALTER TABLE "department" DROP COLUMN "absencePolicyId";
ALTER TABLE "employee" DROP COLUMN "absencePolicyId";

-- CreateIndex
CREATE UNIQUE INDEX "absence_policy_assignment_absenceTypeId_companyId_key" ON "absence_policy_assignment"("absenceTypeId", "companyId");
CREATE UNIQUE INDEX "absence_policy_assignment_absenceTypeId_departmentId_key" ON "absence_policy_assignment"("absenceTypeId", "departmentId");
CREATE UNIQUE INDEX "absence_policy_assignment_absenceTypeId_employeeId_key" ON "absence_policy_assignment"("absenceTypeId", "employeeId");

-- AddForeignKey
ALTER TABLE "absence_policy" ADD CONSTRAINT "absence_policy_absenceTypeId_fkey" FOREIGN KEY ("absenceTypeId") REFERENCES "absence_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "absence_policy_assignment" ADD CONSTRAINT "absence_policy_assignment_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "absence_policy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "absence_policy_assignment" ADD CONSTRAINT "absence_policy_assignment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "absence_policy_assignment" ADD CONSTRAINT "absence_policy_assignment_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "absence_policy_assignment" ADD CONSTRAINT "absence_policy_assignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "absence_balance" ADD CONSTRAINT "absence_balance_absenceTypeId_fkey" FOREIGN KEY ("absenceTypeId") REFERENCES "absence_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
