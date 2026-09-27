import { Prisma } from '@prisma/client';
import { businessDateOf } from '../common/dates';

// Số hóa đơn, e.g. 27093020001:
//   2709 — day and month of the business day the bill was closed on,
//   3020 — the room (4 digits; a 3-digit room 302 is padded to 3020),
//   001  — the n-th bill closed in the branch that business day.
// A bill gets its number when it is closed, paid or cancelled, and keeps it
// when it is voided; numbers are never reused.

type Tx = Prisma.TransactionClient;

// The room's 4-digit code: the last run of digits in its name ("P401" →
// 4010, "Phòng 8888" → 8888), right-padded with 0 or cut to its last 4
// digits; 0000 when the name has no digits.
export function roomCode(roomName?: string | null): string {
  const digits = /(\d+)\D*$/.exec(roomName ?? '')?.[1];
  if (!digits) return '0000';
  return digits.length >= 4 ? digits.slice(-4) : digits.padEnd(4, '0');
}

// `businessDate` is YYYY-MM-DD. The sequence has at least 3 digits.
export function formatBillNumber(
  businessDate: string,
  roomName: string | null | undefined,
  seq: number,
): string {
  const [, month, day] = businessDate.split('-');
  return `${day}${month}${roomCode(roomName)}${String(seq).padStart(3, '0')}`;
}

// Prisma filter for the numbers starting with `prefix` (digits). A range
// instead of LIKE, so the (branchId, billNumber) index serves it whatever
// the database collation: ["2709", "271") holds every number starting 2709.
export function billNumberPrefixRange(prefix: string): {
  gte: string;
  lt?: string;
} {
  const stem = prefix.replace(/9+$/, '');
  if (!stem) return { gte: prefix };
  const last = Number(stem[stem.length - 1]) + 1;
  return { gte: prefix, lt: `${stem.slice(0, -1)}${last}` };
}

// Hands out the next number of the branch for the business day of
// `closedAt`. The counter row is incremented atomically and stays locked
// until the transaction ends, so concurrent checkouts never share a number
// and a rolled-back checkout gives its number back.
export async function nextBillNumber(
  tx: Tx,
  branchId: number,
  closedAt: Date,
  roomName?: string | null,
) {
  const date = businessDateOf(closedAt);
  const [{ lastSeq }] = await tx.$queryRaw<{ lastSeq: number }[]>`
    INSERT INTO "BillCounter" ("branchId", "businessDate", "lastSeq")
    VALUES (${branchId}, ${date}::date, 1)
    ON CONFLICT ("branchId", "businessDate")
    DO UPDATE SET "lastSeq" = "BillCounter"."lastSeq" + 1
    RETURNING "lastSeq"`;
  return {
    businessDate: new Date(`${date}T00:00:00Z`),
    billSeq: lastSeq,
    billNumber: formatBillNumber(date, roomName, lastSeq),
  };
}
