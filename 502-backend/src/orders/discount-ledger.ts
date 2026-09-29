import { ConflictException } from '@nestjs/common';
import { DiscountRequestStatus, DiscountSource, Prisma } from '@prisma/client';
import { Adjustments } from './discount-rules';

type Db = Prisma.TransactionClient;

export const PENDING_REQUEST_MESSAGE =
  'Hóa đơn đang chờ quản lý duyệt giảm giá. Chờ duyệt hoặc hủy yêu cầu.';

// Discount requests seen from the order's writers (checkout, cancel, the
// correction of a paid bill). Always called after the order's row lock, so
// the pending request of an order cannot change underneath. Uses the
// DiscountRequest(orderId) index.
export function pendingRequestOf(tx: Db, orderId: number) {
  return tx.discountRequest.findFirst({
    where: { orderId, status: DiscountRequestStatus.PENDING },
    select: { id: true },
  });
}

export async function assertNoPendingRequest(tx: Db, orderId: number) {
  if (await pendingRequestOf(tx, orderId)) {
    throw new ConflictException(PENDING_REQUEST_MESSAGE);
  }
}

// Closing a session (checkout, cancel) drops a request still waiting.
export function expirePendingRequests(tx: Db, orderId: number, at: Date) {
  return tx.discountRequest.updateMany({
    where: { orderId, status: DiscountRequestStatus.PENDING },
    data: { status: DiscountRequestStatus.EXPIRED, decidedAt: at },
  });
}

export interface AdjustmentLogEntry {
  branchId: number;
  orderId: number;
  source: DiscountSource;
  before: Adjustments;
  after: Adjustments;
  amountBefore: number;
  amountAfter: number;
  note?: string | null;
  userId: number;
}

// A change applied at once (DIRECT, PAID_EDIT): written as already approved
// by the one who made it.
export function logAdjustmentChange(tx: Db, entry: AdjustmentLogEntry) {
  const now = new Date();
  return tx.discountRequest.create({
    data: {
      branchId: entry.branchId,
      orderId: entry.orderId,
      status: DiscountRequestStatus.APPROVED,
      source: entry.source,
      before: { ...entry.before },
      after: { ...entry.after },
      amountBefore: entry.amountBefore,
      amountAfter: entry.amountAfter,
      note: entry.note?.trim() || null,
      requestedById: entry.userId,
      decidedById: entry.userId,
      decidedAt: now,
    },
    select: { id: true },
  });
}
