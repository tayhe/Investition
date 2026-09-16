/**
 * Unified financial calculation utilities for portfolio positions and securities.
 * Follows algebraic formulas defined in AGENTS.md:
 * - multiplier = type === "OPTION" ? 100 : Number(multiplier || 1)
 * - costBasis  = quantity × multiplier × avgCost (negative for short)
 * - marketValue = quantity × multiplier × currentPrice (negative for short)
 * - pnl = marketValue - costBasis (unified algebraic formula)
 */

export interface SecurityLike {
  type: string;
  multiplier?: number | { toString(): string } | null;
}

export interface PositionLike {
  quantity: number | { toString(): string };
  avgCost: number | { toString(): string };
  security: SecurityLike;
}

export interface PositionMetrics {
  multiplier: number;
  quantity: number;
  avgCost: number;
  currentPrice: number;
  costBasis: number;
  marketValue: number;
  pnl: number;
  pnlPercent: number;
}

/**
 * Returns security multiplier (standard US option = 100, other = multiplier || 1).
 */
export function getMultiplier(security?: SecurityLike | null): number {
  if (!security) return 1;
  return security.type === "OPTION"
    ? 100
    : Number(security.multiplier || 1);
}

/**
 * Calculates algebraic cost basis (quantity × multiplier × avgCost).
 * Negative for short positions.
 */
export function calculateCostBasis(
  quantity: number | { toString(): string },
  avgCost: number | { toString(): string },
  security?: SecurityLike | null
): number {
  const qty = Number(quantity);
  const cost = Number(avgCost);
  const mult = getMultiplier(security);
  return qty * mult * cost;
}

/**
 * Calculates algebraic market value (quantity × multiplier × currentPrice).
 * Negative for short positions.
 */
export function calculateMarketValue(
  quantity: number | { toString(): string },
  currentPrice: number | { toString(): string },
  security?: SecurityLike | null
): number {
  const qty = Number(quantity);
  const price = Number(currentPrice);
  const mult = getMultiplier(security);
  return qty * mult * price;
}

/**
 * Calculates unified position metrics (costBasis, marketValue, pnl, pnlPercent).
 */
export function calculatePositionMetrics(
  pos: PositionLike,
  currentPrice?: number | null
): PositionMetrics {
  const qty = Number(pos.quantity);
  const avgCost = Number(pos.avgCost);
  const mult = getMultiplier(pos.security);

  const price =
    currentPrice !== undefined && currentPrice !== null
      ? currentPrice
      : avgCost;
  const costBasis = calculateCostBasis(qty, avgCost, pos.security);
  const marketValue = calculateMarketValue(qty, price, pos.security);
  const pnl = marketValue - costBasis;
  const absCost = Math.abs(costBasis);
  const pnlPercent = absCost > 0 ? (pnl / absCost) * 100 : 0;

  return {
    multiplier: mult,
    quantity: qty,
    avgCost,
    currentPrice: price,
    costBasis,
    marketValue,
    pnl,
    pnlPercent,
  };
}
