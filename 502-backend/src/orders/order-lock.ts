import { ConflictException } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';

type Db = Prisma.TransactionClient;

// Locks an order row until the transaction ends, provided it still has
// `status`. The UPDATE takes the lock (a concurrent writer waits here, then
// re-checks the status) and bumps updatedAt, so the room page on other
// devices picks the change up on its next poll.
export async function lockOrderRow(
  tx: Db,
  id: number,
  status: OrderStatus,
  conflictMessage: string,
) {
  const { count } = await tx.order.updateMany({
    where: { id, status },
    data: { updatedAt: new Date() },
  });
  if (count === 0) throw new ConflictException(conflictMessage);
}

// Closing a room (checkout, cancelled session) ends the PR/KTV visits still
// open in it, at the same moment. Uses the PrSession(orderId) index.
export async function closeOpenPrSessions(
  tx: Db,
  orderId: number,
  endAt: Date,
) {
  await tx.prSession.updateMany({
    where: { orderId, endAt: null },
    data: { endAt },
  });
}
