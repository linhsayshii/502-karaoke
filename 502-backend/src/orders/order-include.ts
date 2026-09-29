import { Prisma } from '@prisma/client';

export const staffRef = { select: { id: true, fullName: true } };

// Only what the screens show: bill lists return up to 1000 orders, so a
// whole product or room row per line would be carried for nothing.
export const orderInclude = {
  room: { select: { id: true, name: true, type: true } },
  cskh: staffRef,
  server: staffRef,
  createdBy: staffRef,
  checkedOutBy: staffRef,
  cancelledBy: staffRef,
  editedBy: staffRef,
  timeLockedBy: staffRef,
  items: {
    include: { product: { select: { id: true, name: true, unit: true } } },
    orderBy: { id: 'asc' },
  },
  fundTransaction: {
    select: { id: true, method: true, amount: true, cancelledAt: true },
  },
} satisfies Prisma.OrderInclude;

// A PR/KTV visit as the room page shows it.
export const prSessionSelect = {
  id: true,
  orderId: true,
  prStaffId: true,
  startAt: true,
  endAt: true,
  prStaff: { select: { id: true, code: true, name: true } },
} satisfies Prisma.PrSessionSelect;

// One order as the room page and the bill sheet show it: the list fields
// plus the PR/KTV visits (kept out of the 1000-bill list).
export const orderDetailInclude = {
  ...orderInclude,
  prSessions: { select: prSessionSelect, orderBy: { id: 'asc' } },
} satisfies Prisma.OrderInclude;
