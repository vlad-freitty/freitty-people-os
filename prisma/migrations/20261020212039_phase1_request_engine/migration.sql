-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('laptop', 'phone', 'license', 'other');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('contract', 'nda', 'act', 'invoice', 'w9', 'other');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('active', 'expired', 'archived');

-- CreateEnum
CREATE TYPE "RequestKind" AS ENUM ('generic', 'hiring', 'onboarding', 'access', 'offboarding', 'absence', 'bonus');

-- CreateEnum
CREATE TYPE "VersionStatus" AS ENUM ('draft', 'published', 'archived');

-- CreateEnum
CREATE TYPE "FieldType" AS ENUM ('text', 'textarea', 'number', 'date', 'date_range', 'select', 'multiselect', 'person', 'file', 'systems');

-- CreateEnum
CREATE TYPE "StepType" AS ENUM ('approve', 'task', 'fill', 'document', 'child_request');

-- CreateEnum
CREATE TYPE "AssigneeRule" AS ENUM ('person', 'initiator_dept_head', 'subject_dept_head', 'system_owner', 'role_first_free');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('draft', 'in_progress', 'done', 'rejected', 'cancelled');

-- CreateEnum
CREATE TYPE "StepStatus" AS ENUM ('waiting', 'active', 'needs_assignment', 'done', 'rejected', 'skipped');

-- CreateTable
CREATE TABLE "system" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "ownerEmployeeId" UUID,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "system_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_bundle" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "positionOrRole" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "access_bundle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_bundle_item" (
    "bundleId" UUID NOT NULL,
    "systemId" UUID NOT NULL,
    "accessLevel" TEXT NOT NULL,

    CONSTRAINT "access_bundle_item_pkey" PRIMARY KEY ("bundleId","systemId")
);

-- CreateTable
CREATE TABLE "access_grant" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "systemId" UUID NOT NULL,
    "accessLevel" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "requestId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID,

    CONSTRAINT "access_grant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset" (
    "id" UUID NOT NULL,
    "type" "AssetType" NOT NULL,
    "name" TEXT NOT NULL,
    "serialOrSeat" TEXT,
    "monthlyCost" DECIMAL(12,2),
    "currency" CHAR(3),
    "assignedToId" UUID,
    "assignedAt" TIMESTAMP(3),
    "returnedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "type" "DocumentType" NOT NULL,
    "fileKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "period" TEXT,
    "validFrom" DATE,
    "validTo" DATE,
    "status" "DocumentStatus" NOT NULL DEFAULT 'active',
    "requestId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_type" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "nameUk" TEXT NOT NULL,
    "nameEn" TEXT,
    "kind" "RequestKind" NOT NULL,
    "departmentId" UUID,
    "whoCanInitiate" JSONB NOT NULL,
    "currentVersionId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "request_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_type_version" (
    "id" UUID NOT NULL,
    "requestTypeId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "VersionStatus" NOT NULL DEFAULT 'draft',
    "publishedById" UUID,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID,

    CONSTRAINT "request_type_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_field" (
    "id" UUID NOT NULL,
    "versionId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "labelUk" TEXT NOT NULL,
    "labelEn" TEXT,
    "type" "FieldType" NOT NULL,
    "options" JSONB,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL,

    CONSTRAINT "form_field_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "step_template" (
    "id" UUID NOT NULL,
    "versionId" UUID NOT NULL,
    "orderGroup" INTEGER NOT NULL,
    "nameUk" TEXT NOT NULL,
    "nameEn" TEXT,
    "stepType" "StepType" NOT NULL,
    "assigneeRule" "AssigneeRule" NOT NULL,
    "assigneeValue" TEXT,
    "slaDays" INTEGER NOT NULL,
    "checklist" JSONB,
    "requiredFields" TEXT[],
    "onReject" JSONB NOT NULL,
    "childRequestTypeId" UUID,

    CONSTRAINT "step_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request" (
    "id" UUID NOT NULL,
    "number" SERIAL NOT NULL,
    "requestTypeVersionId" UUID NOT NULL,
    "initiatorId" UUID NOT NULL,
    "subjectEmployeeId" UUID,
    "status" "RequestStatus" NOT NULL DEFAULT 'draft',
    "currentGroup" INTEGER NOT NULL DEFAULT 0,
    "departmentId" UUID NOT NULL,
    "parentStepId" UUID,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID,

    CONSTRAINT "request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_field_value" (
    "requestId" UUID NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "value" JSONB NOT NULL,

    CONSTRAINT "request_field_value_pkey" PRIMARY KEY ("requestId","fieldKey")
);

-- CreateTable
CREATE TABLE "step_instance" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "stepTemplateId" UUID NOT NULL,
    "orderGroup" INTEGER NOT NULL,
    "systemId" UUID,
    "assigneeId" UUID,
    "status" "StepStatus" NOT NULL DEFAULT 'waiting',
    "activatedAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "completedById" UUID,
    "comment" TEXT,
    "checklistState" JSONB,
    "attachments" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "step_instance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comment" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "system_name_key" ON "system"("name");

-- CreateIndex
CREATE UNIQUE INDEX "access_bundle_name_key" ON "access_bundle"("name");

-- CreateIndex
CREATE INDEX "access_grant_employeeId_idx" ON "access_grant"("employeeId");

-- CreateIndex
CREATE INDEX "asset_assignedToId_idx" ON "asset"("assignedToId");

-- CreateIndex
CREATE INDEX "document_employeeId_idx" ON "document"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "request_type_code_key" ON "request_type"("code");

-- CreateIndex
CREATE UNIQUE INDEX "request_type_currentVersionId_key" ON "request_type"("currentVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "request_type_version_requestTypeId_version_key" ON "request_type_version"("requestTypeId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "form_field_versionId_key_key" ON "form_field"("versionId", "key");

-- CreateIndex
CREATE INDEX "step_template_versionId_idx" ON "step_template"("versionId");

-- CreateIndex
CREATE UNIQUE INDEX "request_number_key" ON "request"("number");

-- CreateIndex
CREATE UNIQUE INDEX "request_parentStepId_key" ON "request"("parentStepId");

-- CreateIndex
CREATE INDEX "request_initiatorId_idx" ON "request"("initiatorId");

-- CreateIndex
CREATE INDEX "request_subjectEmployeeId_idx" ON "request"("subjectEmployeeId");

-- CreateIndex
CREATE INDEX "request_departmentId_idx" ON "request"("departmentId");

-- CreateIndex
CREATE INDEX "step_instance_requestId_idx" ON "step_instance"("requestId");

-- CreateIndex
CREATE INDEX "step_instance_assigneeId_status_idx" ON "step_instance"("assigneeId", "status");

-- CreateIndex
CREATE INDEX "comment_requestId_idx" ON "comment"("requestId");

-- AddForeignKey
ALTER TABLE "system" ADD CONSTRAINT "system_ownerEmployeeId_fkey" FOREIGN KEY ("ownerEmployeeId") REFERENCES "employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_bundle_item" ADD CONSTRAINT "access_bundle_item_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "access_bundle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_bundle_item" ADD CONSTRAINT "access_bundle_item_systemId_fkey" FOREIGN KEY ("systemId") REFERENCES "system"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_grant" ADD CONSTRAINT "access_grant_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_grant" ADD CONSTRAINT "access_grant_systemId_fkey" FOREIGN KEY ("systemId") REFERENCES "system"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_grant" ADD CONSTRAINT "access_grant_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "request"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset" ADD CONSTRAINT "asset_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document" ADD CONSTRAINT "document_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document" ADD CONSTRAINT "document_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "request"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_type" ADD CONSTRAINT "request_type_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_type" ADD CONSTRAINT "request_type_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "request_type_version"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_type_version" ADD CONSTRAINT "request_type_version_requestTypeId_fkey" FOREIGN KEY ("requestTypeId") REFERENCES "request_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_field" ADD CONSTRAINT "form_field_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "request_type_version"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "step_template" ADD CONSTRAINT "step_template_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "request_type_version"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "step_template" ADD CONSTRAINT "step_template_childRequestTypeId_fkey" FOREIGN KEY ("childRequestTypeId") REFERENCES "request_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request" ADD CONSTRAINT "request_requestTypeVersionId_fkey" FOREIGN KEY ("requestTypeVersionId") REFERENCES "request_type_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request" ADD CONSTRAINT "request_initiatorId_fkey" FOREIGN KEY ("initiatorId") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request" ADD CONSTRAINT "request_subjectEmployeeId_fkey" FOREIGN KEY ("subjectEmployeeId") REFERENCES "employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request" ADD CONSTRAINT "request_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request" ADD CONSTRAINT "request_parentStepId_fkey" FOREIGN KEY ("parentStepId") REFERENCES "step_instance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_field_value" ADD CONSTRAINT "request_field_value_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "step_instance" ADD CONSTRAINT "step_instance_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "step_instance" ADD CONSTRAINT "step_instance_stepTemplateId_fkey" FOREIGN KEY ("stepTemplateId") REFERENCES "step_template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "step_instance" ADD CONSTRAINT "step_instance_systemId_fkey" FOREIGN KEY ("systemId") REFERENCES "system"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "step_instance" ADD CONSTRAINT "step_instance_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment" ADD CONSTRAINT "comment_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment" ADD CONSTRAINT "comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One active grant per (employee, system); revoked grants stay as history
CREATE UNIQUE INDEX "access_grant_active_unique" ON "access_grant"("employeeId", "systemId") WHERE "revokedAt" IS NULL;
