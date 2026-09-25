import { getToday } from "@/lib/utils";

const IBKR_FLEX_BASE = "https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService";

export interface IbkrFlexConfig {
  token: string;
  queryId: string;
}

export interface FlexTrade {
  transactionId: string;
  symbol: string;
  description: string;
  exchange: string;
  tradeDate: string;
  tradeTime: string;
  buySell: "BUY" | "SELL";
  quantity: number;
  price: number;
  amount: number;
  commission: number;
  cost: number;
  currency: string;
  ibOrderID: string;
  conid: string;
  contractType: string;
}

export interface FlexPosition {
  conid: string;
  symbol: string;
  description: string;
  exchange: string;
  quantity: number;
  averageCost: number;
  marketPrice: number;
  marketValue: number;
  multiplier: number;
  currency: string;
  unrealizedPnl: number;
  contractType: string;
}

export interface FlexCashBalance {
  currency: string;           // "USD", "EUR", "BASE_SUMMARY" etc.
  endingCash: number;         // trade-date basis (use for snapshot)
  endingSettledCash: number;  // settlement-date basis
}

export interface FlexCashTransaction {
  transactionId?: string;
  currency: string;
  dateTime: string;
  amount: number;             // signed: negative = outflow
  type: string;               // "Dividend" | "Deposit" | "Withdrawal" | "Commissions" | ...
  description: string;
  fxRateToBase: number;
}

export interface FlexReport {
  trades: FlexTrade[];
  positions: FlexPosition[];
  cashBalances: FlexCashBalance[];
  cashTransactions: FlexCashTransaction[];
  baseCurrency: string;
  year: number;
}

export async function fetchFlexReferenceCode(config: IbkrFlexConfig): Promise<string> {
  const params = new URLSearchParams({
    t: config.token,
    q: config.queryId,
    v: "3",
  });

  const response = await fetch(`${IBKR_FLEX_BASE}/SendRequest?${params}`);
  const text = await response.text();

  const match = text.match(/<ReferenceCode>(.*?)<\/ReferenceCode>/);
  if (!match) {
    const msgMatch = text.match(/<ErrorMessage>(.*?)<\/ErrorMessage>/);
    throw new Error(msgMatch ? msgMatch[1] : "Failed to get Flex reference code");
  }

  return match[1];
}

export interface FlexSyncResult {
  report: FlexReport;
  rawXml: string;
}

export async function fetchFlexReport(referenceCode: string, token: string): Promise<FlexReport> {
  const params = new URLSearchParams({
    t: token,
    q: referenceCode,
    v: "3",
  });

  const response = await fetch(
    `${IBKR_FLEX_BASE}/GetStatement?${params}`
  );

  const text = await response.text();

  if (text.includes("<ErrorMessage>")) {
    const msgMatch = text.match(/<ErrorMessage>(.*?)<\/ErrorMessage>/);
    throw new Error(msgMatch ? msgMatch[1] : "Flex report error");
  }

  return parseFlexXml(text);
}

export async function fetchFlexReportWithXml(referenceCode: string, token: string): Promise<FlexSyncResult> {
  const params = new URLSearchParams({
    t: token,
    q: referenceCode,
    v: "3",
  });

  const response = await fetch(
    `${IBKR_FLEX_BASE}/GetStatement?${params}`
  );

  const text = await response.text();

  if (text.includes("<ErrorMessage>")) {
    const msgMatch = text.match(/<ErrorMessage>(.*?)<\/ErrorMessage>/);
    throw new Error(msgMatch ? msgMatch[1] : "Flex report error");
  }

  return { report: parseFlexXml(text), rawXml: text };
}

export async function syncIbkrFlex(config: IbkrFlexConfig): Promise<FlexSyncResult> {
  const refCode = await fetchFlexReferenceCode(config);

  await new Promise((resolve) => setTimeout(resolve, 5000));

  return fetchFlexReportWithXml(refCode, config.token);
}

export function parseFlexXml(xml: string): FlexReport {
  const lastStatementIdx = xml.lastIndexOf("<FlexStatement");
  const lastXml = lastStatementIdx >= 0 ? xml.slice(lastStatementIdx) : xml;

  let year = new Date().getFullYear();
  const statementMatch = lastXml.match(/<FlexStatement[^>]*fromDate="(\d{4})/);
  if (statementMatch) {
    year = parseInt(statementMatch[1]);
  }

  const tradeRegex = /<Trade\s+([^>]*)\/>/g;
  const tradeMap = new Map<string, FlexTrade>();
  let match;
  while ((match = tradeRegex.exec(xml)) !== null) {
    const attrs = parseXmlAttributes(match[1]);
    const dateTime = attrs.dateTime || "";
    const dateParts = dateTime.split(";");
    const tradeDate = attrs.tradeDate || dateParts[0] || "";
    const tradeTime = dateParts[1] || attrs.tradeTime || "";
    const ibOrderID = attrs.ibOrderID || "";

    const dedupKey = ibOrderID
      ? `${ibOrderID}_${attrs.buySell}_${attrs.quantity}_${attrs.tradePrice}`
      : `${attrs.symbol}_${tradeDate}_${attrs.buySell}_${attrs.quantity}_${attrs.tradePrice}`;
    if (tradeMap.has(dedupKey)) continue;

    tradeMap.set(dedupKey, {
      transactionId: attrs.transactionId || attrs.tradeID || "",
      symbol: attrs.symbol || "",
      description: attrs.description || "",
      exchange: attrs.listingExchange || attrs.exchange || "",
      tradeDate,
      tradeTime,
      buySell: (attrs.buySell as "BUY" | "SELL") || "BUY",
      quantity: parseFloat(attrs.quantity || "0"),
      price: parseFloat(attrs.tradePrice || "0"),
      amount: parseFloat(attrs.tradeMoney || "0"),
      commission: Math.abs(parseFloat(attrs.ibCommission || "0")),
      cost: parseFloat(attrs.cost || "0"),
      currency: attrs.currency || "USD",
      ibOrderID,
      conid: attrs.conid || "",
      contractType: attrs.assetCategory || attrs.contractType || "STK",
    });
  }

  const trades = Array.from(tradeMap.values());

  const posRegex = /<OpenPosition\s+([^>]*)\/>|<ComplexPosition\s+([^>]*)\/>/g;
  const posMap = new Map<string, FlexPosition>();
  const today = getToday();

  while ((match = posRegex.exec(lastXml)) !== null) {
    const attrStr = match[1] || match[2];
    const attrs = parseXmlAttributes(attrStr);
    const quantity = parseFloat(attrs.position || attrs.quantity || "0");
    if (quantity === 0) continue;

    const assetCategory = (attrs.assetCategory || attrs.assetClass || attrs.contractType || "STK").toUpperCase();
    if (assetCategory === "OPT") {
      const expiryStr = attrs.expiry || "";
      if (expiryStr.length >= 8) {
        const year = parseInt(expiryStr.slice(0, 4));
        const month = parseInt(expiryStr.slice(4, 6)) - 1;
        const day = parseInt(expiryStr.slice(6, 8));
        const expiry = new Date(Date.UTC(year, month, day));
        if (expiry < today) continue;
      }
    }

    const symbol = attrs.symbol || "";
    const marketPrice = parseFloat(
      attrs.markPrice || attrs.closePrice || attrs.marketPrice || "0"
    );
    const marketValue = parseFloat(
      attrs.positionValueInBase || attrs.positionValue || attrs.value || attrs.marketValue || "0"
    );
    const multiplier = parseFloat(attrs.multiplier || "1");
    let averageCost = parseFloat(
      attrs.costBasisPrice || attrs.averageCost || "0"
    );
    if (averageCost === 0) {
      const costBasisMoney = parseFloat(attrs.costBasisMoney || "0");
      if (costBasisMoney !== 0 && quantity !== 0) {
        averageCost = Math.abs(costBasisMoney / (quantity * multiplier));
      }
    }
    const unrealizedPnl = parseFloat(
      attrs.fifoPnlUnrealized || attrs.unrealizedPnl || attrs.unrealizedPnL || attrs.mtmPnl || "0"
    );

    const existing = posMap.get(symbol);
    if (existing) {
      const prevTotalCost = existing.quantity * existing.multiplier * existing.averageCost;
      const newTotalCost = quantity * multiplier * averageCost;
      const totalQty = existing.quantity + quantity;

      existing.quantity = totalQty;
      existing.marketValue += marketValue;
      existing.unrealizedPnl += unrealizedPnl;
      if (totalQty !== 0 && (prevTotalCost + newTotalCost) !== 0) {
        existing.averageCost = Math.abs((prevTotalCost + newTotalCost) / (totalQty * multiplier));
      } else if (averageCost > 0) {
        existing.averageCost = averageCost;
      }
      if (marketPrice > 0) {
        existing.marketPrice = marketPrice;
      }
    } else {
      posMap.set(symbol, {
        conid: attrs.conid || "",
        symbol,
        description: attrs.description || "",
        exchange: attrs.listingExchange || attrs.exchange || "",
        quantity,
        averageCost,
        marketPrice,
        marketValue,
        multiplier,
        currency: attrs.currency || "USD",
        unrealizedPnl,
        contractType: attrs.assetCategory || attrs.assetClass || attrs.contractType || "STK",
      });
    }
  }

  const positions = Array.from(posMap.values());

  // Parse AccountInformation for base currency
  let baseCurrency = "USD";
  const acctInfoMatch = lastXml.match(/<AccountInformation\s+([^>]*)\/>/);
  if (acctInfoMatch) {
    const acctAttrs = parseXmlAttributes(acctInfoMatch[1]);
    if (acctAttrs.currency) baseCurrency = acctAttrs.currency;
  }

  // Parse CashReportCurrency entries (from Cash Report section)
  const cashBalances: FlexCashBalance[] = [];
  const cashBalanceRegex = /<CashReportCurrency\s+([^>]*)\/>/g;
  while ((match = cashBalanceRegex.exec(lastXml)) !== null) {
    const attrs = parseXmlAttributes(match[1]);
    cashBalances.push({
      currency: attrs.currency || "",
      endingCash: parseFloat(attrs.endingCash || "0"),
      endingSettledCash: parseFloat(attrs.endingSettledCash || "0"),
    });
  }

  // Parse CashTransaction entries across all statements (from Cash Transactions section)
  const cashTxMap = new Map<string, FlexCashTransaction>();
  const cashTxRegex = /<CashTransaction\s+([^>]*)\/>/g;
  while ((match = cashTxRegex.exec(xml)) !== null) {
    const attrs = parseXmlAttributes(match[1]);
    const transactionId = attrs.transactionID || attrs.transactionId || "";
    const dateTime = attrs.dateTime || attrs.reportDate || "";
    const currency = attrs.currency || "";
    const amount = parseFloat(attrs.amount || "0");
    const type = attrs.type || "";

    const dedupKey = transactionId || `${dateTime}_${type}_${amount}_${currency}`;
    if (cashTxMap.has(dedupKey)) continue;

    cashTxMap.set(dedupKey, {
      transactionId: transactionId || undefined,
      currency,
      dateTime,
      amount,
      type,
      description: attrs.description || "",
      fxRateToBase: parseFloat(attrs.fxRateToBase || "1"),
    });
  }
  const cashTransactions = Array.from(cashTxMap.values());

  return { trades, positions, cashBalances, cashTransactions, baseCurrency, year };
}

/** Returns the account's total cash in base currency from a parsed FlexReport. */
export function getCashBalance(
  cashBalances: FlexCashBalance[],
  baseCurrency: string
): number {
  // Multi-currency accounts include a BASE_SUMMARY row already converted
  const baseSummary = cashBalances.find((c) => c.currency === "BASE_SUMMARY");
  if (baseSummary) return baseSummary.endingCash;
  // Single-currency: use the row matching the account base currency
  const direct = cashBalances.find((c) => c.currency === baseCurrency);
  return direct?.endingCash ?? 0;
}

function parseXmlAttributes(attrString: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const regex = /(\w+)="([^"]*)"/g;
  let match;
  while ((match = regex.exec(attrString)) !== null) {
    attrs[match[1]] = match[2];
  }
  return attrs;
}

export function mapIbkrExchangeToMarket(exchange: string): "US" | "HK" | "A" {
  const upper = exchange.toUpperCase();
  if (["SEHK", "HKFE"].includes(upper)) return "HK";
  if (["SSE", "SZSE", "SEHK_SH", "SEHK_SZ"].includes(upper)) return "A";
  return "US";
}

export function normalizeSymbol(flexSymbol: string): string {
  return flexSymbol;
}

export interface DailyPositionData {
  date: string;
  symbol: string;
  conid: string;
  exchange: string;
  quantity: number;
  marketPrice: number;
  marketValue: number;
  currency: string;
  contractType: string;
}

export function parseAllDailyPositions(xml: string): DailyPositionData[] {
  const dailyMap = new Map<string, DailyPositionData>();
  const statementRegex = /<FlexStatement[^>]*fromDate="(\d{4})(\d{2})(\d{2})"[^>]*>/g;
  let stmtMatch;

  while ((stmtMatch = statementRegex.exec(xml)) !== null) {
    const stmtStart = stmtMatch.index;
    const stmtDate = `${stmtMatch[1]}-${stmtMatch[2]}-${stmtMatch[3]}`;

    const nextStmtIdx = xml.indexOf("<FlexStatement", stmtStart + 1);
    const stmtXml = nextStmtIdx >= 0 ? xml.slice(stmtStart, nextStmtIdx) : xml.slice(stmtStart);

    const posRegex = /<OpenPosition\s+([^>]*)\/>|<ComplexPosition\s+([^>]*)\/>/g;
    let posMatch;
    while ((posMatch = posRegex.exec(stmtXml)) !== null) {
      const attrs = parseXmlAttributes(posMatch[1] || posMatch[2]);
      const quantity = parseFloat(attrs.position || attrs.quantity || "0");
      if (quantity === 0) continue;

      const assetCategory = (attrs.assetCategory || attrs.assetClass || attrs.contractType || "STK").toUpperCase();
      if (assetCategory === "OPT") {
        const expiryStr = attrs.expiry || "";
        if (expiryStr.length >= 8) {
          const expYear = parseInt(expiryStr.slice(0, 4));
          const expMonth = parseInt(expiryStr.slice(4, 6)) - 1;
          const expDay = parseInt(expiryStr.slice(6, 8));
          if (new Date(Date.UTC(expYear, expMonth, expDay)) < new Date(stmtDate)) continue;
        }
      }

      const symbol = attrs.symbol || "";
      const exchange = attrs.listingExchange || attrs.exchange || "";
      const marketPrice = parseFloat(attrs.markPrice || attrs.closePrice || attrs.marketPrice || "0");
      const marketValue = parseFloat(attrs.positionValueInBase || attrs.positionValue || attrs.value || attrs.marketValue || "0");
      const key = `${stmtDate}_${symbol}_${exchange}`;

      const existing = dailyMap.get(key);
      if (existing) {
        existing.quantity += quantity;
        existing.marketValue += marketValue;
        if (marketPrice > 0) existing.marketPrice = marketPrice;
      } else {
        dailyMap.set(key, {
          date: stmtDate,
          symbol,
          conid: attrs.conid || "",
          exchange,
          quantity,
          marketPrice,
          marketValue,
          currency: attrs.currency || "USD",
          contractType: assetCategory,
        });
      }
    }
  }

  return Array.from(dailyMap.values());
}

/**
 * Parses all external cash flows (deposits, withdrawals, transfers) by date (YYYY-MM-DD)
 * in the account's base currency from the Flex report XML.
 */
export function parseCashFlowsByDate(xml: string): Map<string, number> {
  const flowMap = new Map<string, number>();

  // 1. Try CashReportCurrency with currency="BASE_SUMMARY" from daily statements
  const stmtRegex = /<CashReportCurrency\s+([^>]*)\/>/g;
  let match;
  let hasStmtFlows = false;
  while ((match = stmtRegex.exec(xml)) !== null) {
    const attrs = parseXmlAttributes(match[1]);
    if (attrs.currency === "BASE_SUMMARY") {
      const dw = parseFloat(attrs.depositWithdrawals || "0");
      const at = parseFloat(attrs.accountTransfers || "0");
      const it = parseFloat(attrs.internalTransfers || "0");
      const net = dw + at + it;
      const fromDate = attrs.fromDate || "";
      if (fromDate.length >= 8) {
        const d = `${fromDate.slice(0, 4)}-${fromDate.slice(4, 6)}-${fromDate.slice(6, 8)}`;
        if (net !== 0) {
          flowMap.set(d, (flowMap.get(d) || 0) + net);
          hasStmtFlows = true;
        }
      }
    }
  }

  // 2. If no CashReportCurrency statement flows found, parse from CashTransaction
  if (!hasStmtFlows) {
    const cashTxRegex = /<CashTransaction\s+([^>]*)\/>/g;
    const seenTx = new Set<string>();
    while ((match = cashTxRegex.exec(xml)) !== null) {
      const attrs = parseXmlAttributes(match[1]);
      const txId = attrs.transactionID || attrs.transactionId || "";
      const type = attrs.type || "";
      if (
        type === "Deposits/Withdrawals" ||
        type === "Transfers" ||
        type.toLowerCase().includes("deposit") ||
        type.toLowerCase().includes("withdrawal")
      ) {
        const dt = (attrs.dateTime || attrs.reportDate || "").split(";")[0];
        const key = txId || `${dt}_${type}_${attrs.amount}_${attrs.currency}`;
        if (seenTx.has(key)) continue;
        seenTx.add(key);

        const amount = parseFloat(attrs.amount || "0");
        const fxRate = parseFloat(attrs.fxRateToBase || "1");
        const baseAmt = amount * fxRate;
        const d = dt.length === 8 ? `${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)}` : dt;
        if (d && baseAmt !== 0) {
          flowMap.set(d, (flowMap.get(d) || 0) + baseAmt);
        }
      }
    }
  }

  return flowMap;
}

export interface DailySnapshotData {
  date: string;
  positionsValue: number;
  cashBalance: number;
  totalValue: number;
  depositWithdrawals: number;
}

export function parseAllDailySnapshots(xml: string): DailySnapshotData[] {
  const statementRegex = /<FlexStatement[^>]*fromDate="(\d{4})(\d{2})(\d{2})"[^>]*>/g;
  let stmtMatch;
  const list: DailySnapshotData[] = [];

  while ((stmtMatch = statementRegex.exec(xml)) !== null) {
    const stmtStart = stmtMatch.index;
    const stmtDate = `${stmtMatch[1]}-${stmtMatch[2]}-${stmtMatch[3]}`;

    const nextStmtIdx = xml.indexOf("<FlexStatement", stmtStart + 1);
    const stmtXml = nextStmtIdx >= 0 ? xml.slice(stmtStart, nextStmtIdx) : xml.slice(stmtStart);

    let cash = 0;
    let dw = 0;
    const cashMatch = stmtXml.match(/<CashReportCurrency\s+([^>]*currency="BASE_SUMMARY"[^>]*)\/>/);
    if (cashMatch) {
      const attrs = parseXmlAttributes(cashMatch[1]);
      cash = parseFloat(attrs.endingCash || "0");
      const d = parseFloat(attrs.depositWithdrawals || "0");
      const at = parseFloat(attrs.accountTransfers || "0");
      const it = parseFloat(attrs.internalTransfers || "0");
      dw = d + at + it;
    }

    let posVal = 0;
    const posRegex = /<OpenPosition\s+([^>]*)\/>|<ComplexPosition\s+([^>]*)\/>/g;
    let posMatch;
    while ((posMatch = posRegex.exec(stmtXml)) !== null) {
      const attrs = parseXmlAttributes(posMatch[1] || posMatch[2]);
      const pv = parseFloat(attrs.positionValueInBase || attrs.positionValue || attrs.value || attrs.marketValue || "0");
      posVal += pv;
    }

    list.push({
      date: stmtDate,
      positionsValue: posVal,
      cashBalance: cash,
      totalValue: posVal + cash,
      depositWithdrawals: dw,
    });
  }

  return list;
}
