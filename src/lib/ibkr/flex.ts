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
  tradePrice: number;
  tradeMoney: number;
  ibCommission: number;
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
  currency: string;
  unrealizedPnl: number;
  contractType: string;
}

export interface FlexReport {
  trades: FlexTrade[];
  positions: FlexPosition[];
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
  const trades: FlexTrade[] = [];
  const positions: FlexPosition[] = [];

  const tradeRegex = /<Trade\s+([^>]*)\/>/g;
  let match;
  while ((match = tradeRegex.exec(xml)) !== null) {
    const attrs = parseXmlAttributes(match[1]);
    const dateTime = attrs.dateTime || "";
    const dateParts = dateTime.split(";");
    const tradeDate = attrs.tradeDate || dateParts[0] || "";
    const tradeTime = dateParts[1] || attrs.tradeTime || "";

    trades.push({
      transactionId: attrs.transactionId || "",
      symbol: attrs.symbol || "",
      description: attrs.description || "",
      exchange: attrs.exchange || "",
      tradeDate,
      tradeTime,
      buySell: (attrs.buySell as "BUY" | "SELL") || "BUY",
      quantity: parseFloat(attrs.quantity || "0"),
      tradePrice: parseFloat(attrs.tradePrice || "0"),
      tradeMoney: parseFloat(attrs.tradeMoney || "0"),
      ibCommission: parseFloat(attrs.ibCommission || "0"),
      currency: attrs.currency || "USD",
      ibOrderID: attrs.ibOrderID || "",
      conid: attrs.conid || "",
      contractType: attrs.assetClass || attrs.contractType || "STK",
    });
  }

  const posRegex = /<OpenPosition\s+([^>]*)\/>|<ComplexPosition\s+([^>]*)\/>/g;
  while ((match = posRegex.exec(xml)) !== null) {
    const attrStr = match[1] || match[2];
    const attrs = parseXmlAttributes(attrStr);
    const quantity = parseFloat(attrs.position || attrs.quantity || "0");
    if (quantity === 0) continue;

    const marketPrice = parseFloat(
      attrs.markPrice || attrs.closePrice || attrs.marketPrice || "0"
    );
    const marketValue = parseFloat(
      attrs.positionValue || attrs.value || attrs.marketValue || "0"
    );
    let averageCost = parseFloat(
      attrs.costBasisPrice || attrs.averageCost || "0"
    );
    if (averageCost === 0) {
      const costBasisMoney = parseFloat(attrs.costBasisMoney || "0");
      if (costBasisMoney !== 0 && quantity !== 0) {
        averageCost = costBasisMoney / Math.abs(quantity);
      }
    }
    const unrealizedPnl = parseFloat(
      attrs.fifoPnlUnrealized || attrs.unrealizedPnl || attrs.unrealizedPnL || attrs.mtmPnl || "0"
    );

    positions.push({
      conid: attrs.conid || "",
      symbol: attrs.symbol || "",
      description: attrs.description || "",
      exchange: attrs.listingExchange || attrs.exchange || "",
      quantity,
      averageCost,
      marketPrice,
      marketValue,
      currency: attrs.currency || "USD",
      unrealizedPnl,
      contractType: attrs.assetCategory || attrs.assetClass || attrs.contractType || "STK",
    });
  }

  return { trades, positions };
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

export function normalizeSymbol(flexSymbol: string, exchange: string): string {
  return flexSymbol;
}
