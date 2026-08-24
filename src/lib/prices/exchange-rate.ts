import YahooFinance from "yahoo-finance2";
import { db } from "@/lib/db";
import { getToday } from "@/lib/utils";

const yahooFinance = new YahooFinance();

const REQUEST_DELAY_MS = 200;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const PAIRS: [string, string][] = [
  ["USD", "CNY"],
  ["USD", "HKD"],
  ["USD", "SEK"],
  ["USD", "EUR"],
  ["USD", "GBP"],
  ["USD", "JPY"],
  ["USD", "CAD"],
  ["USD", "AUD"],
  ["USD", "SGD"],
  ["HKD", "CNY"],
];

export async function fetchExchangeRates() {
  const today = getToday();
  const results = { updated: 0, skipped: 0, errors: [] as string[] };

  for (const [base, quote] of PAIRS) {
    const existing = await db.exchangeRate.findUnique({
      where: {
        baseCurrency_quoteCurrency_date: {
          baseCurrency: base,
          quoteCurrency: quote,
          date: today,
        },
      },
    });

    if (existing) {
      results.skipped++;
      continue;
    }

    try {
      const symbol = `${base}${quote}=X`;
      const data = await yahooFinance.quote(symbol) as Record<string, unknown> | null;
      const price = data?.regularMarketPrice as number | undefined;
      if (!price) {
        results.errors.push(`${base}/${quote}: no rate data`);
        continue;
      }

      await db.exchangeRate.upsert({
        where: {
          baseCurrency_quoteCurrency_date: {
            baseCurrency: base,
            quoteCurrency: quote,
            date: today,
          },
        },
        update: { rate: price },
        create: {
          baseCurrency: base,
          quoteCurrency: quote,
          rate: price,
          date: today,
        },
      });

      results.updated++;
      await sleep(REQUEST_DELAY_MS);
    } catch (err) {
      results.errors.push(
        `${base}/${quote}: ${err instanceof Error ? err.message : "unknown error"}`
      );
      await sleep(REQUEST_DELAY_MS * 2);
    }
  }

  return results;
}

export async function getLatestRate(
  baseCurrency: string,
  quoteCurrency: string
): Promise<number | null> {
  const base = baseCurrency.toUpperCase().trim();
  const quote = quoteCurrency.toUpperCase().trim();

  if (base === quote) return 1;

  // Direct rate
  const rate = await db.exchangeRate.findFirst({
    where: { baseCurrency: base, quoteCurrency: quote },
    orderBy: { date: "desc" },
  });

  if (rate) return Number(rate.rate);

  // Inverse rate
  const inverse = await db.exchangeRate.findFirst({
    where: { baseCurrency: quote, quoteCurrency: base },
    orderBy: { date: "desc" },
  });

  if (inverse && Number(inverse.rate) > 0) return 1 / Number(inverse.rate);

  // Cross rate via USD triangulation (e.g. SEK -> CNY = (SEK -> USD) * (USD -> CNY))
  if (base !== "USD" && quote !== "USD") {
    const baseToUsd = await getLatestRate(base, "USD");
    const usdToQuote = await getLatestRate("USD", quote);
    if (baseToUsd !== null && usdToQuote !== null) {
      return baseToUsd * usdToQuote;
    }
  }

  return null;
}

export async function getLatestRatesMap(): Promise<Map<string, number>> {
  const rates = await db.exchangeRate.findMany({
    orderBy: { date: "desc" },
  });
  const map = new Map<string, number>();
  for (const r of rates) {
    const key = `${r.baseCurrency}_${r.quoteCurrency}`;
    if (!map.has(key)) map.set(key, Number(r.rate));
  }
  return map;
}

export function convertCurrency(
  amount: number,
  from: string,
  to: string,
  rates: Map<string, number>
): number {
  if (from === to) return amount;
  const direct = rates.get(`${from}_${to}`);
  if (direct) return amount * direct;
  const inverse = rates.get(`${to}_${from}`);
  if (inverse && inverse > 0) return amount / inverse;
  const fromToUsd =
    from === "USD"
      ? 1
      : rates.get(`${from}_USD`) ??
        (rates.get(`USD_${from}`) ? 1 / rates.get(`USD_${from}`)! : null);
  const toToUsd =
    to === "USD"
      ? 1
      : rates.get(`${to}_USD`) ??
        (rates.get(`USD_${to}`) ? 1 / rates.get(`USD_${to}`)! : null);
  if (fromToUsd !== null && toToUsd !== null && toToUsd > 0) {
    return (amount * fromToUsd) / toToUsd;
  }
  return amount;
}
