const IBKR_FLEX_URL = "https://gdcdyn.interactivebrokers.com/Universal/servlet/FlexStatementServiceServlet";

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

  const response = await fetch(`${IBKR_FLEX_URL}?${params}`);
  const text = await response.text();

  const match = text.match(/<ReferenceCode>(.*?)<\/ReferenceCode>/);
  if (!match) {
    const msgMatch = text.match(/<ErrorMessage>(.*?)<\/ErrorMessage>/);
    throw new Error(msgMatch ? msgMatch[1] : "Failed to get Flex reference code");
  }

  return match[1];
}

export async function fetchFlexReport(referenceCode: string, token: string): Promise<FlexReport> {
  const params = new URLSearchParams({
    t: token,
    q: referenceCode,
    v: "3",
  });

  const response = await fetch(
    `https://gdcdyn.interactivebrokers.com/Universal/servlet/FlexStatementServiceServlet?${params}`
  );

  const text = await response.text();

  if (text.includes("<ErrorMessage>")) {
    const msgMatch = text.match(/<ErrorMessage>(.*?)<\/ErrorMessage>/);
    throw new Error(msgMatch ? msgMatch[1] : "Flex report error");
  }

  return parseFlexXml(text);
}

export async function syncIbkrFlex(config: IbkrFlexConfig): Promise<FlexReport> {
  const refCode = await fetchFlexReferenceCode(config);

  await new Promise((resolve) => setTimeout(resolve, 5000));

  return fetchFlexReport(refCode, config.token);
}

function parseFlexXml(xml: string): FlexReport {
  const trades: FlexTrade[] = [];
  const positions: FlexPosition[] = [];

  const tradeRegex = /<Trade\s+([^>]*)\/>/g;
  let match;
  while ((match = tradeRegex.exec(xml)) !== null) {
    const attrs = parseXmlAttributes(match[1]);
    trades.push({
      transactionId: attrs.transactionId || "",
      symbol: attrs.symbol || "",
      description: attrs.description || "",
      exchange: attrs.exchange || "",
      tradeDate: attrs.tradeDate || "",
      tradeTime: attrs.tradeTime || "",
      buySell: (attrs.buySell as "BUY" | "SELL") || "BUY",
      quantity: parseFloat(attrs.quantity || "0"),
      tradePrice: parseFloat(attrs.tradePrice || "0"),
      tradeMoney: parseFloat(attrs.tradeMoney || "0"),
      ibCommission: parseFloat(attrs.ibCommission || "0"),
      currency: attrs.currency || "USD",
      ibOrderID: attrs.ibOrderID || "",
      conid: attrs.conid || "",
      contractType: attrs.contractType || "STK",
    });
  }

  const posRegex = /<Position\s+([^>]*)\/>/g;
  while ((match = posRegex.exec(xml)) !== null) {
    const attrs = parseXmlAttributes(match[1]);
    positions.push({
      conid: attrs.conid || "",
      symbol: attrs.symbol || "",
      description: attrs.description || "",
      exchange: attrs.exchange || "",
      quantity: parseFloat(attrs.quantity || "0"),
      averageCost: parseFloat(attrs.averageCost || "0"),
      marketPrice: parseFloat(attrs.marketPrice || "0"),
      marketValue: parseFloat(attrs.marketValue || "0"),
      currency: attrs.currency || "USD",
      unrealizedPnl: parseFloat(attrs.unrealizedPnl || "0"),
      contractType: attrs.contractType || "STK",
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
