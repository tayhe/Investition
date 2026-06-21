import { NextResponse } from "next/server";
import { fetchPrices, fetchHistoricalPrices } from "@/lib/prices/fetcher";
import { fetchExchangeRates } from "@/lib/prices/exchange-rate";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const historical = body.historical === true;
    const days = body.days ?? 30;

    const [priceResult, rateResult] = await Promise.all([
      historical ? fetchHistoricalPrices(days) : fetchPrices(),
      fetchExchangeRates(),
    ]);

    return NextResponse.json({
      prices: priceResult,
      exchangeRates: rateResult,
    });
  } catch (error) {
    console.error("Price fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch prices" },
      { status: 500 }
    );
  }
}
