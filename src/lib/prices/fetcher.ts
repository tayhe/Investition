import YahooFinance from "yahoo-finance2";
import { db } from "@/lib/db";

const yahooFinance = new YahooFinance();

const REQUEST_DELAY_MS = 200;
const PRICE_CACHE_HOURS = 4;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function toYahooSymbol(ibkrSymbol: string, exchange: string): string | null {
  if (ibkrSymbol.includes("=")) return null;
  if (/\d{6}[CP]\d{8}/.test(ibkrSymbol)) return null;

  if (ibkrSymbol.includes(".")) {
    const parts = ibkrSymbol.split(".");
    if (parts.length === 2 && parts[0].length === 3 && parts[1].length === 3) {
      return `${parts[0]}${parts[1]}=X`;
    }
  }

  const exchangeMap: Record<string, string> = {
    SFB: ".ST",
    STO: ".ST",
    LSE: ".L",
    TSE: ".T",
    HKG: ".HK",
    SSE: ".SS",
    SZSE: ".SZ",
    FRA: ".F",
    ETR: ".DE",
    AMS: ".AS",
    BIT: ".MI",
    BME: ".MC",
    SWX: ".SW",
  };

  const suffix = exchangeMap[exchange?.toUpperCase()];
  if (suffix) return `${ibkrSymbol}${suffix}`;

  return ibkrSymbol;
}

function isValidYahooSymbol(symbol: string): boolean {
  return symbol !== null;
}

async function needsPriceUpdate(securityId: string): Promise<boolean> {
  const cutoff = new Date();
  cutoff.setHours(cutoff.getHours() - PRICE_CACHE_HOURS);
  const recent = await db.price.findFirst({
    where: { securityId, date: { gte: cutoff } },
    select: { id: true },
  });
  return !recent;
}

export async function fetchPrices() {
  const securities = await db.security.findMany();
  if (securities.length === 0) return { updated: 0, skipped: 0, errors: [] };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const results = { updated: 0, skipped: 0, errors: [] as string[] };

  for (const sec of securities) {
    const yahooSymbol = toYahooSymbol(sec.symbol, sec.exchange ?? "");
    if (!yahooSymbol) {
      results.skipped++;
      continue;
    }

    if (!(await needsPriceUpdate(sec.id))) {
      results.skipped++;
      continue;
    }

    try {
      const raw = await yahooFinance.quote(yahooSymbol) as Record<string, unknown> | null;
      const price = raw?.regularMarketPrice as number | undefined;
      if (!price) {
        results.errors.push(`${sec.symbol} (${yahooSymbol}): no price data`);
        continue;
      }

      const rawQuote = raw!;
      const close = price;

      await db.price.upsert({
        where: { securityId_date: { securityId: sec.id, date: today } },
        update: {
          close,
          open: (rawQuote.regularMarketOpen as number) ?? null,
          high: (rawQuote.regularMarketDayHigh as number) ?? null,
          low: (rawQuote.regularMarketDayLow as number) ?? null,
          volume: (rawQuote.regularMarketVolume as number) ?? null,
        },
        create: {
          securityId: sec.id,
          date: today,
          close,
          open: (rawQuote.regularMarketOpen as number) ?? null,
          high: (rawQuote.regularMarketDayHigh as number) ?? null,
          low: (rawQuote.regularMarketDayLow as number) ?? null,
          volume: (rawQuote.regularMarketVolume as number) ?? null,
          currency: sec.currency,
        },
      });

      results.updated++;
      await sleep(REQUEST_DELAY_MS);
    } catch (err) {
      results.errors.push(`${sec.symbol}: ${err instanceof Error ? err.message : "unknown error"}`);
      await sleep(REQUEST_DELAY_MS * 2);
    }
  }

  return results;
}

export async function fetchHistoricalPrices(days = 30) {
  const securities = await db.security.findMany();
  if (securities.length === 0) return { updated: 0, errors: [] };

  const results = { updated: 0, errors: [] as string[] };

  for (const sec of securities) {
    const yahooSymbol = toYahooSymbol(sec.symbol, sec.exchange ?? "");
    if (!yahooSymbol) continue;

    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const history = await yahooFinance.historical(yahooSymbol, {
        period1: startDate,
        period2: endDate,
      }) as Array<{ date: Date; close: number; open?: number; high?: number; low?: number; volume?: number }>;

      for (const bar of history) {
        const date = new Date(bar.date);
        date.setHours(0, 0, 0, 0);

        await db.price.upsert({
          where: { securityId_date: { securityId: sec.id, date } },
          update: {
            close: bar.close,
            open: bar.open ?? null,
            high: bar.high ?? null,
            low: bar.low ?? null,
            volume: bar.volume ?? null,
          },
          create: {
            securityId: sec.id,
            date,
            close: bar.close,
            open: bar.open ?? null,
            high: bar.high ?? null,
            low: bar.low ?? null,
            volume: bar.volume ?? null,
            currency: sec.currency,
          },
        });
      }

      results.updated++;
      await sleep(REQUEST_DELAY_MS);
    } catch (err) {
      results.errors.push(`${sec.symbol}: ${err instanceof Error ? err.message : "unknown error"}`);
      await sleep(REQUEST_DELAY_MS * 2);
    }
  }

  return results;
}
