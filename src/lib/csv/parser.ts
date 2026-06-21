import { parse } from "csv-parse/sync";

export interface CsvTrade {
  date: string;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  amount: number;
  commission: number;
  currency: string;
  description?: string;
}

export interface CsvPosition {
  symbol: string;
  description: string;
  quantity: number;
  price: number;
  marketValue: number;
  currency: string;
}

export interface ParseResult {
  trades: CsvTrade[];
  positions: CsvPosition[];
  format: string;
  errors: string[];
}

function detectFormat(headers: string[]): string {
  const h = headers.map((s) => s.toLowerCase().trim());
  const has = (name: string) => h.some((s) => s.includes(name));

  if (has("action") && has("symbol") && has("quantity")) return "schwab_transactions";
  if (has("symbol") && has("quantity") && has("price") && !has("action")) return "schwab_positions";
  if (has("tradedate") || (has("trade date") && has("buy/sell"))) return "ibkr";
  if (has("date") && has("symbol") && (has("side") || has("action"))) return "generic";

  return "generic";
}

function cleanNumber(val: string): number {
  if (!val) return 0;
  return parseFloat(val.replace(/[$,¥HK$\s]/g, "")) || 0;
}

function parseSchwabTransactions(records: Record<string, string>[]): CsvTrade[] {
  const trades: CsvTrade[] = [];

  for (const row of records) {
    const action = (row["Action"] || row["action"] || "").toLowerCase().trim();
    const symbol = (row["Symbol"] || row["symbol"] || "").trim();

    if (!symbol) continue;

    let side: "BUY" | "SELL" = "BUY";
    if (action.includes("sell") || action.includes("sold")) side = "SELL";
    else if (action.includes("buy") || action.includes("bought")) side = "BUY";
    else continue;

    const date = row["Date"] || row["date"] || row["Trade Date"] || "";
    const quantity = cleanNumber(row["Quantity"] || row["quantity"] || "0");
    const price = cleanNumber(row["Price"] || row["price"] || "0");
    const amount = cleanNumber(row["Amount"] || row["amount"] || row["Net Amount"] || String(quantity * price));
    const commission = cleanNumber(row["Commissions"] || row["Commission"] || row["Fees"] || "0");

    trades.push({
      date: date.split(" ")[0],
      symbol,
      side,
      quantity: Math.abs(quantity),
      price,
      amount: Math.abs(amount),
      commission: Math.abs(commission),
      currency: "USD",
      description: row["Description"] || row["description"] || "",
    });
  }

  return trades;
}

function parseSchwabPositions(records: Record<string, string>[]): CsvPosition[] {
  const positions: CsvPosition[] = [];

  for (const row of records) {
    const symbol = (row["Symbol"] || row["symbol"] || "").trim();
    if (!symbol || symbol === "Cash" || symbol === "Total") continue;

    const quantity = cleanNumber(row["Quantity"] || row["quantity"] || "0");
    const price = cleanNumber(row["Price"] || row["price"] || row["Last Price"] || "0");
    const marketValue = cleanNumber(row["Market Value"] || row["marketValue"] || String(quantity * price));

    positions.push({
      symbol,
      description: row["Description"] || row["description"] || symbol,
      quantity,
      price,
      marketValue,
      currency: "USD",
    });
  }

  return positions;
}

function parseGeneric(records: Record<string, string>[]): CsvTrade[] {
  const trades: CsvTrade[] = [];

  for (const row of records) {
    const symbol = (row["symbol"] || row["Symbol"] || row["ticker"] || "").trim();
    if (!symbol) continue;

    const date = row["date"] || row["Date"] || row["trade_date"] || "";
    const sideStr = (row["side"] || row["Side"] || row["action"] || row["Action"] || row["type"] || "").toUpperCase();
    const side: "BUY" | "SELL" = sideStr.includes("SEL") || sideStr.includes("S") ? "SELL" : "BUY";
    const quantity = cleanNumber(row["quantity"] || row["Quantity"] || row["qty"] || "0");
    const price = cleanNumber(row["price"] || row["Price"] || "0");
    const amount = cleanNumber(row["amount"] || row["Amount"] || row["total"] || String(quantity * price));
    const commission = cleanNumber(row["commission"] || row["Commission"] || row["fee"] || row["Fee"] || "0");
    const currency = (row["currency"] || row["Currency"] || "USD").toUpperCase();

    trades.push({
      date,
      symbol,
      side,
      quantity: Math.abs(quantity),
      price,
      amount: Math.abs(amount),
      commission: Math.abs(commission),
      currency,
      description: row["description"] || row["Description"] || "",
    });
  }

  return trades;
}

function parseIBKR(records: Record<string, string>[]): CsvTrade[] {
  const trades: CsvTrade[] = [];

  for (const row of records) {
    const header = (row["Header"] || row["header"] || "").trim();
    if (header !== "Trades") continue;

    const symbol = (row["Symbol"] || row["symbol"] || "").trim();
    if (!symbol) continue;

    const sideStr = (row["Buy/Sell"] || row["Side"] || "").toUpperCase();
    const side: "BUY" | "SELL" = sideStr.includes("SEL") ? "SELL" : "BUY";
    const date = row["TradeDate"] || row["Trade Date"] || row["Date/Time"] || "";
    const quantity = cleanNumber(row["Quantity"] || row["quantity"] || "0");
    const price = cleanNumber(row["TradePrice"] || row["T. Price"] || "0");
    const amount = cleanNumber(row["TradeMoney"] || row["Proceeds"] || String(quantity * price));
    const commission = cleanNumber(row["IBCommission"] || row["Comm/Fee"] || "0");
    const currency = (row["Currency"] || row["currency"] || "USD").toUpperCase();

    trades.push({
      date: date.split(";")[0].replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3"),
      symbol,
      side,
      quantity: Math.abs(quantity),
      price,
      amount: Math.abs(amount),
      commission: Math.abs(commission),
      currency,
    });
  }

  return trades;
}

export function parseCsv(content: string): ParseResult {
  const errors: string[] = [];

  try {
    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    }) as Record<string, string>[];

    if (records.length === 0) {
      return { trades: [], positions: [], format: "empty", errors: ["CSV 文件为空"] };
    }

    const headers = Object.keys(records[0]);
    const format = detectFormat(headers);

    let trades: CsvTrade[] = [];
    let positions: CsvPosition[] = [];

    switch (format) {
      case "schwab_transactions":
        trades = parseSchwabTransactions(records);
        break;
      case "schwab_positions":
        positions = parseSchwabPositions(records);
        break;
      case "ibkr":
        trades = parseIBKR(records);
        break;
      case "generic":
      default:
        trades = parseGeneric(records);
        break;
    }

    if (trades.length === 0 && positions.length === 0) {
      errors.push("未能解析出有效数据，请检查 CSV 格式");
    }

    return { trades, positions, format, errors };
  } catch (err) {
    return {
      trades: [],
      positions: [],
      format: "error",
      errors: [`CSV 解析失败: ${err instanceof Error ? err.message : "未知错误"}`],
    };
  }
}
