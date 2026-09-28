import { StockMovementType } from '@prisma/client';

// Weighted average cost (giá vốn bình quân gia quyền) of a product's stock.
// Costs are per unit, rounded to 2 decimals.

export const roundCost = (value: number) => Math.round(value * 100) / 100;

// Average after `quantity` units come in at `unitCost`. A line without a
// cost keeps the average; with nothing (or less) in stock there is nothing
// to average with, so the new cost is the average.
export function receive(
  stockBefore: number,
  average: number,
  quantity: number,
  unitCost: number,
): number {
  if (unitCost <= 0) return average;
  if (stockBefore <= 0) return roundCost(unitCost);
  return roundCost(
    (stockBefore * average + quantity * unitCost) / (stockBefore + quantity),
  );
}

// Average after a cancelled import takes `quantity` units at `unitCost`
// back out. Nothing left: the average stays. Never below zero.
export function unreceive(
  stockBefore: number,
  average: number,
  quantity: number,
  unitCost: number,
): number {
  const remaining = stockBefore - quantity;
  if (remaining <= 0 || unitCost <= 0) return average;
  return Math.max(
    0,
    roundCost((stockBefore * average - quantity * unitCost) / remaining),
  );
}

export interface MovementCost {
  unitCost: number; // what one unit of the movement is valued at
  costAfter: number; // the product's average cost after it
}

// Valuation of one stock movement (quantity signed: + in, − out):
// - goods in (an import, goods put back by a voided or corrected bill or a
//   cancelled export) come in at `unitCost`, or at the average when there
//   is none;
// - a cancelled import (a REVERSAL out) goes back out at its own cost;
// - every other movement out (sale, export) leaves at the average.
export function costMovement(m: {
  type: StockMovementType;
  quantity: number;
  stockBefore: number;
  average: number;
  unitCost?: number;
}): MovementCost {
  const given =
    m.unitCost !== undefined && m.unitCost > 0
      ? roundCost(m.unitCost)
      : undefined;
  if (m.quantity > 0) {
    return {
      unitCost: given ?? m.average,
      costAfter: receive(m.stockBefore, m.average, m.quantity, given ?? 0),
    };
  }
  if (m.quantity < 0 && m.type === StockMovementType.REVERSAL) {
    return {
      unitCost: given ?? m.average,
      costAfter: unreceive(m.stockBefore, m.average, -m.quantity, given ?? 0),
    };
  }
  return { unitCost: m.average, costAfter: m.average };
}
