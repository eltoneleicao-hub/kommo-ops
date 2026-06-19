-- AlterTable: add updatedAt to Label
-- DEFAULT CURRENT_TIMESTAMP preenche as linhas já existentes (ADD COLUMN NOT NULL
-- numa tabela com dados exige default). O Prisma mantém o valor via @updatedAt.
ALTER TABLE "Label" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
