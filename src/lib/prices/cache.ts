import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";

export async function getLatestPrices(securityIds: string[]): Promise<Map<string, number>> {
  if (securityIds.length === 0) return new Map();

  const rows = await db.$queryRaw<{ securityId: string; close: Prisma.Decimal }[]>`
    SELECT p."securityId", p.close
    FROM "Price" p
    INNER JOIN (
      SELECT "securityId", MAX(date) as max_date
      FROM "Price"
      WHERE "securityId" = ANY(${securityIds})
      GROUP BY "securityId"
    ) latest ON p."securityId" = latest."securityId" AND p.date = latest.max_date
  `;

  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.securityId, Number(row.close));
  }
  return map;
}
