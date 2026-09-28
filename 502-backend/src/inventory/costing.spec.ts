import { StockMovementType } from '@prisma/client';
import { costMovement, receive, roundCost, unreceive } from './costing';

describe('receive', () => {
  it('averages two batches by quantity', () => {
    const first = receive(0, 0, 10, 10000);
    expect(first).toBe(10000);
    expect(receive(10, first, 10, 20000)).toBe(15000);
  });

  it('starts over from the new cost when nothing (or less) is in stock', () => {
    expect(receive(0, 15000, 5, 12000)).toBe(12000);
    expect(receive(-3, 15000, 5, 12000)).toBe(12000);
  });

  it('keeps the average for a line without a cost', () => {
    expect(receive(10, 15000, 5, 0)).toBe(15000);
    expect(receive(0, 15000, 5, 0)).toBe(15000);
  });

  it('rounds to 2 decimals', () => {
    expect(receive(2, 10, 1, 11)).toBe(10.33);
  });
});

describe('unreceive', () => {
  it('takes a cancelled batch back out of the average', () => {
    expect(unreceive(20, 15000, 10, 20000)).toBe(10000);
    expect(unreceive(24, 17500, 4, 30000)).toBe(15000);
  });

  it('keeps the average when nothing is left', () => {
    expect(unreceive(10, 15000, 10, 20000)).toBe(15000);
    expect(unreceive(4, 15000, 6, 20000)).toBe(15000);
  });

  it('keeps the average for a batch without a cost', () => {
    expect(unreceive(20, 15000, 5, 0)).toBe(15000);
  });

  it('never goes below zero', () => {
    expect(unreceive(5, 1000, 4, 5000)).toBe(0);
  });
});

describe('costMovement', () => {
  const at = (
    type: StockMovementType,
    quantity: number,
    stockBefore: number,
    average: number,
    unitCost?: number,
  ) => costMovement({ type, quantity, stockBefore, average, unitCost });

  it('values an import at its line cost', () => {
    expect(at(StockMovementType.IMPORT, 10, 10, 10000, 20000)).toEqual({
      unitCost: 20000,
      costAfter: 15000,
    });
  });

  it('values an import without a cost at the average (Ruling 1)', () => {
    expect(at(StockMovementType.IMPORT, 5, 10, 15000, 0)).toEqual({
      unitCost: 15000,
      costAfter: 15000,
    });
  });

  it('lets sales and exports leave at the average', () => {
    expect(at(StockMovementType.SALE, -4, 20, 15000)).toEqual({
      unitCost: 15000,
      costAfter: 15000,
    });
    expect(at(StockMovementType.EXPORT, -1, 20, 15000, 99999)).toEqual({
      unitCost: 15000,
      costAfter: 15000,
    });
  });

  it('receives goods put back at the cost they left at', () => {
    expect(at(StockMovementType.REVERSAL, 4, 20, 18000, 15000)).toEqual({
      unitCost: 15000,
      costAfter: 17500,
    });
  });

  it('takes a cancelled import back out at its own cost', () => {
    expect(at(StockMovementType.REVERSAL, -4, 24, 17500, 30000)).toEqual({
      unitCost: 30000,
      costAfter: 15000,
    });
  });

  it('rounds costs to 2 decimals', () => {
    expect(roundCost(17979.999)).toBe(17980);
    // (23 × 18,460 + 3 × 17,980) / 26 = 18,404.615…
    expect(at(StockMovementType.REVERSAL, 3, 23, 18460, 17980)).toEqual({
      unitCost: 17980,
      costAfter: 18404.62,
    });
  });
});
