/**
 * Unified financial calculation utilities for portfolio positions.
 * Follows algebraic formulas defined in AGENTS.md:
 * - multiplier = type === "OPTION" ? 100 : Number(multiplier || 1)
 * - costBasis  = quantity × multiplier × avgCost (negative for short)
 * - marketValue = quantity × multiplier × currentPrice (negative for short)
 * - pnl = marketValue - costBasis (unified algebraic formula)
 */

export interface PositionLike {
  quantity: number | { toString(): string };
  avgCost: number | { toString(): string };
  security: {
    type: string;
    multiplier?: number | { toString(): string } | null;
  };
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

export function calculatePositionMetrics(
  pos: PositionLike,
  currentPrice?: number | null
): PositionMetrics {
  const qty = Number(pos.quantity);
  const avgCost = Number(pos.avgCost);
  const mult =
    pos.security.type === "OPTION"
      ? 100
      : Number(pos.security.multiplier || 1);

  const price =
    currentPrice !== undefined && currentPrice !== null
      ? currentPrice
      : avgCost;
  const costBasis = qty * mult * avgCost;
  const marketValue = qty * mult * price;
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
