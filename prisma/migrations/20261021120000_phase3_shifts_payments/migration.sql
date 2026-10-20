-- CreateEnum
CREATE TYPE "ShiftStatus" AS ENUM ('planned', 'confirmed', 'locked');

-- CreateEnum
CREATE TYPE "ShiftSource" AS ENUM ('manual', 'csv_import');

-- CreateEnum
CREATE TYPE "PeriodStatus" AS ENUM ('open', 'calculated', 'locked');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('calculated', 'documents_received', 'approved', 'paid');

-- CreateEnum
CREATE TYPE "PaymentLineKind" AS ENUM ('shifts', 'monthly_rate', 'bonus', 'adjustment');

-- CreateEnum
CREATE TYPE "BonusSource" AS ENUM ('cs_incentive', 'manual');

-- CreateEnum
CREATE TYPE "BonusStatus" AS ENUM ('approved', 'included', 'paid');

-- AlterTable
ALTER TABLE "company" ADD COLUMN     "nonWorkingShiftCoefficient" DECIMAL(4,2) NOT NULL DEFAULT 1.0;

-- CreateTable
CREATE TABLE "shift" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "departmentId" UUID NOT NULL,
    "locationId" UUID,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL,
    "workDate" DATE NOT NULL,
    "shiftType" TEXT NOT NULL DEFAULT 'regular',
    "status" "ShiftStatus" NOT NULL DEFAULT 'planned',
    "source" "ShiftSource" NOT NULL DEFAULT 'manual',
    "confirmedById" UUID,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "shift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_period" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "status" "PeriodStatus" NOT NULL DEFAULT 'open',
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID,

    CONSTRAINT "payment_period_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment" (
    "id" UUID NOT NULL,
    "periodId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'calculated',
    "paidAt" TIMESTAMP(3),
    "paymentRef" TEXT,
    "approvedById" UUID,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_line" (
    "id" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "kind" "PaymentLineKind" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "description" TEXT NOT NULL,
    "sourceIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" UUID,

    CONSTRAINT "payment_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bonus" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "period" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "source" "BonusSource" NOT NULL DEFAULT 'cs_incentive',
    "status" "BonusStatus" NOT NULL DEFAULT 'approved',
    "requestId" UUID,
    "paymentId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID,

    CONSTRAINT "bonus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shift_companyId_workDate_idx" ON "shift"("companyId", "workDate");

-- CreateIndex
CREATE INDEX "shift_departmentId_workDate_idx" ON "shift"("departmentId", "workDate");

-- CreateIndex
CREATE UNIQUE INDEX "shift_employeeId_startAt_key" ON "shift"("employeeId", "startAt");

-- CreateIndex
CREATE UNIQUE INDEX "payment_period_companyId_periodStart_key" ON "payment_period"("companyId", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "payment_periodId_employeeId_currency_key" ON "payment"("periodId", "employeeId", "currency");

-- CreateIndex
CREATE INDEX "payment_line_paymentId_idx" ON "payment_line"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "bonus_requestId_key" ON "bonus"("requestId");

-- CreateIndex
CREATE INDEX "bonus_employeeId_status_idx" ON "bonus"("employeeId", "status");

-- AddForeignKey
ALTER TABLE "shift" ADD CONSTRAINT "shift_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift" ADD CONSTRAINT "shift_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift" ADD CONSTRAINT "shift_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift" ADD CONSTRAINT "shift_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_period" ADD CONSTRAINT "payment_period_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "payment_period"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_line" ADD CONSTRAINT "payment_line_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bonus" ADD CONSTRAINT "bonus_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bonus" ADD CONSTRAINT "bonus_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "request"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bonus" ADD CONSTRAINT "bonus_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

