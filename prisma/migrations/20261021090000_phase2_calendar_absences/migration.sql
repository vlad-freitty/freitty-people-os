-- CreateEnum
CREATE TYPE "LayerEffect" AS ENUM ('non_working', 'informational');

-- CreateEnum
CREATE TYPE "LayerSource" AS ENUM ('manual', 'ics_import', 'csv_import', 'system');

-- CreateEnum
CREATE TYPE "SystemLayerKind" AS ENUM ('birthdays', 'work_anniversaries');

-- CreateEnum
CREATE TYPE "LayerVisibility" AS ENUM ('all', 'assigned_only');

-- CreateEnum
CREATE TYPE "Recurrence" AS ENUM ('none', 'yearly');

-- CreateEnum
CREATE TYPE "LayerTarget" AS ENUM ('company', 'department', 'location', 'employee');

-- CreateEnum
CREATE TYPE "AccrualMode" AS ENUM ('upfront', 'monthly');

-- CreateEnum
CREATE TYPE "PeriodStart" AS ENUM ('hire_date', 'jan_1');

-- CreateEnum
CREATE TYPE "ExpiryMode" AS ENUM ('end_of_period', 'months_after', 'never');

-- CreateEnum
CREATE TYPE "DayCount" AS ENUM ('working', 'calendar');

-- CreateEnum
CREATE TYPE "LedgerType" AS ENUM ('accrual', 'usage', 'expiry', 'carryover', 'manual_adjustment');

-- CreateEnum
CREATE TYPE "AbsenceStatus" AS ENUM ('approved', 'cancelled');

-- AlterTable
ALTER TABLE "app_user" ADD COLUMN     "calendarToken" TEXT;

-- AlterTable
ALTER TABLE "company" ADD COLUMN     "absencePolicyId" UUID;

-- AlterTable
ALTER TABLE "department" ADD COLUMN     "absencePolicyId" UUID;

-- CreateTable
CREATE TABLE "calendar_layer" (
    "id" UUID NOT NULL,
    "nameUk" TEXT NOT NULL,
    "nameEn" TEXT,
    "color" TEXT NOT NULL DEFAULT '#7d7a85',
    "effect" "LayerEffect" NOT NULL,
    "source" "LayerSource" NOT NULL DEFAULT 'manual',
    "systemKind" "SystemLayerKind",
    "visibility" "LayerVisibility" NOT NULL DEFAULT 'assigned_only',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "calendar_layer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_event" (
    "id" UUID NOT NULL,
    "layerId" UUID NOT NULL,
    "titleUk" TEXT NOT NULL,
    "titleEn" TEXT,
    "date" DATE NOT NULL,
    "endDate" DATE,
    "recurrence" "Recurrence" NOT NULL DEFAULT 'none',
    "nonWorking" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "calendar_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "layer_assignment" (
    "layerId" UUID NOT NULL,
    "targetType" "LayerTarget" NOT NULL,
    "targetId" UUID NOT NULL,

    CONSTRAINT "layer_assignment_pkey" PRIMARY KEY ("layerId","targetType","targetId")
);

-- CreateTable
CREATE TABLE "work_week" (
    "id" UUID NOT NULL,
    "locationId" UUID,
    "companyId" UUID,
    "days" INTEGER[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_week_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "absence_type" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "nameUk" TEXT NOT NULL,
    "nameEn" TEXT,
    "color" TEXT NOT NULL DEFAULT '#1f7a4d',
    "paid" BOOLEAN NOT NULL DEFAULT true,
    "deductsBalance" BOOLEAN NOT NULL DEFAULT false,
    "requiresDocument" BOOLEAN NOT NULL DEFAULT false,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT true,
    "minDays" DECIMAL(5,1),
    "maxDays" DECIMAL(5,1),
    "allowHalfDay" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "absence_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "absence_policy" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "daysPerPeriod" DECIMAL(5,1) NOT NULL,
    "accrual" "AccrualMode" NOT NULL,
    "periodStart" "PeriodStart" NOT NULL,
    "expiry" "ExpiryMode" NOT NULL,
    "expiryMonths" INTEGER,
    "carryoverMax" DECIMAL(5,1) NOT NULL DEFAULT 0,
    "availableAfterDays" INTEGER NOT NULL DEFAULT 0,
    "allowNegative" BOOLEAN NOT NULL DEFAULT false,
    "countDays" "DayCount" NOT NULL DEFAULT 'working',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "absence_policy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "absence_balance" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "policyId" UUID NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "absence_balance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "absence_ledger_entry" (
    "id" UUID NOT NULL,
    "balanceId" UUID NOT NULL,
    "type" "LedgerType" NOT NULL,
    "amount" DECIMAL(6,1) NOT NULL,
    "date" DATE NOT NULL,
    "comment" TEXT,
    "absenceId" UUID,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" UUID,

    CONSTRAINT "absence_ledger_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "absence" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "typeId" UUID NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "halfDay" BOOLEAN NOT NULL DEFAULT false,
    "days" DECIMAL(5,1) NOT NULL,
    "status" "AbsenceStatus" NOT NULL DEFAULT 'approved',
    "requestId" UUID,
    "documentId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID,

    CONSTRAINT "absence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "calendar_layer_systemKind_key" ON "calendar_layer"("systemKind");

-- CreateIndex
CREATE INDEX "calendar_event_layerId_date_idx" ON "calendar_event"("layerId", "date");

-- CreateIndex
CREATE INDEX "layer_assignment_targetType_targetId_idx" ON "layer_assignment"("targetType", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "work_week_locationId_key" ON "work_week"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "work_week_companyId_key" ON "work_week"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "absence_type_code_key" ON "absence_type"("code");

-- CreateIndex
CREATE UNIQUE INDEX "absence_policy_name_key" ON "absence_policy"("name");

-- CreateIndex
CREATE UNIQUE INDEX "absence_balance_employeeId_policyId_periodStart_key" ON "absence_balance"("employeeId", "policyId", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "absence_ledger_entry_idempotencyKey_key" ON "absence_ledger_entry"("idempotencyKey");

-- CreateIndex
CREATE INDEX "absence_ledger_entry_balanceId_idx" ON "absence_ledger_entry"("balanceId");

-- CreateIndex
CREATE UNIQUE INDEX "absence_requestId_key" ON "absence"("requestId");

-- CreateIndex
CREATE INDEX "absence_employeeId_startDate_idx" ON "absence"("employeeId", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "app_user_calendarToken_key" ON "app_user"("calendarToken");

-- AddForeignKey
ALTER TABLE "company" ADD CONSTRAINT "company_absencePolicyId_fkey" FOREIGN KEY ("absencePolicyId") REFERENCES "absence_policy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "department" ADD CONSTRAINT "department_absencePolicyId_fkey" FOREIGN KEY ("absencePolicyId") REFERENCES "absence_policy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_absencePolicyId_fkey" FOREIGN KEY ("absencePolicyId") REFERENCES "absence_policy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_event" ADD CONSTRAINT "calendar_event_layerId_fkey" FOREIGN KEY ("layerId") REFERENCES "calendar_layer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "layer_assignment" ADD CONSTRAINT "layer_assignment_layerId_fkey" FOREIGN KEY ("layerId") REFERENCES "calendar_layer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_week" ADD CONSTRAINT "work_week_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_week" ADD CONSTRAINT "work_week_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "absence_balance" ADD CONSTRAINT "absence_balance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "absence_balance" ADD CONSTRAINT "absence_balance_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "absence_policy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "absence_ledger_entry" ADD CONSTRAINT "absence_ledger_entry_balanceId_fkey" FOREIGN KEY ("balanceId") REFERENCES "absence_balance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "absence_ledger_entry" ADD CONSTRAINT "absence_ledger_entry_absenceId_fkey" FOREIGN KEY ("absenceId") REFERENCES "absence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "absence" ADD CONSTRAINT "absence_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "absence" ADD CONSTRAINT "absence_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "absence_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "absence" ADD CONSTRAINT "absence_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "request"("id") ON DELETE SET NULL ON UPDATE CASCADE;

