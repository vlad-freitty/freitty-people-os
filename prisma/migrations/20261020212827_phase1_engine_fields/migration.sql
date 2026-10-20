-- AlterEnum
ALTER TYPE "AssigneeRule" ADD VALUE 'initiator';

-- AlterTable
ALTER TABLE "step_template" ADD COLUMN     "documentType" "DocumentType";
