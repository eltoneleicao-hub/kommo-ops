-- AlterEnum: add 'processando' to PrintStatus
ALTER TYPE "PrintStatus" ADD VALUE 'processando';

-- AlterTable: add errorMessage to Label
ALTER TABLE "Label" ADD COLUMN "errorMessage" TEXT;
