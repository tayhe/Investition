-- AlterTable: Add year column with default 2026 for existing rows
ALTER TABLE "FlexCache" ADD COLUMN "year" INTEGER NOT NULL DEFAULT 2026;

-- Update existing rows to set year from createdAt
UPDATE "FlexCache" SET "year" = EXTRACT(YEAR FROM "createdAt");

-- Remove duplicates: keep only the latest per account+year
DELETE FROM "FlexCache" WHERE id NOT IN (
  SELECT DISTINCT ON ("accountId", "year") id
  FROM "FlexCache"
  ORDER BY "accountId", "year", "createdAt" DESC
);

-- DropIndex
DROP INDEX IF EXISTS "FlexCache_accountId_createdAt_idx";

-- CreateIndex
CREATE UNIQUE INDEX "FlexCache_accountId_year_key" ON "FlexCache"("accountId", "year");

-- CreateIndex
CREATE INDEX "FlexCache_accountId_idx" ON "FlexCache"("accountId");
