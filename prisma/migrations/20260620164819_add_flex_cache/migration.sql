-- CreateTable
CREATE TABLE "FlexCache" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "xml" TEXT NOT NULL,
    "tradesCount" INTEGER NOT NULL DEFAULT 0,
    "positionsCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FlexCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FlexCache_accountId_createdAt_idx" ON "FlexCache"("accountId", "createdAt");
