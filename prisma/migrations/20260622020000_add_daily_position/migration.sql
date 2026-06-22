CREATE TABLE "DailyPosition" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "securityId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "marketPrice" DECIMAL(18,6) NOT NULL,
    "marketValue" DECIMAL(18,4) NOT NULL,
    "currency" TEXT NOT NULL,

    CONSTRAINT "DailyPosition_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DailyPosition_accountId_securityId_date_key" ON "DailyPosition"("accountId", "securityId", "date");
CREATE INDEX "DailyPosition_accountId_date_idx" ON "DailyPosition"("accountId", "date");
