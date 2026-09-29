import type { Response } from 'express';

// Lists are capped (`take`, docs/resource-rules.md). How many rows matched in
// all goes in this header, so a screen can say it only shows the newest ones;
// the body stays a plain array.
export const TOTAL_COUNT_HEADER = 'X-Total-Count';

// Sets the header from a [rows, total] pair and returns the rows.
export async function withTotalCount<T>(
  res: Response,
  list: Promise<[T[], number]>,
): Promise<T[]> {
  const [rows, total] = await list;
  res.setHeader(TOTAL_COUNT_HEADER, String(total));
  return rows;
}
