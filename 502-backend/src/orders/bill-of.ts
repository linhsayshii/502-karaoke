import { BadRequestException } from '@nestjs/common';
import { Order, Prisma } from '@prisma/client';
import { Bill, computeBill } from './billing';
import { Adjustments } from './discount-rules';

export type BillableOrder = Pick<
  Order,
  | 'startTime'
  | 'pricePerHour'
  | 'discountPercent'
  | 'discountAmount'
  | 'hourlyDiscountPercent'
  | 'hourlyDiscountAmount'
  | 'taxPercent'
> & { items: { price: Prisma.Decimal; quantity: number }[] };

export function adjustmentsOf(order: BillableOrder): Adjustments {
  return {
    discountPercent: order.discountPercent,
    discountAmount: Number(order.discountAmount),
    hourlyDiscountPercent: order.hourlyDiscountPercent,
    hourlyDiscountAmount: Number(order.hourlyDiscountAmount),
    taxPercent: order.taxPercent,
  };
}

// The bill of a session ending at `endTime`, with its stored adjustments or
// the given ones (what a discount request would make of it).
export function billOf(
  order: BillableOrder,
  endTime: Date,
  adjustments: Adjustments = adjustmentsOf(order),
): Bill {
  if (!order.startTime) {
    throw new BadRequestException('Hóa đơn chưa bắt đầu tính giờ');
  }
  return computeBill({
    startTime: order.startTime,
    endTime,
    pricePerHour: Number(order.pricePerHour),
    items: order.items.map((i) => ({
      price: Number(i.price),
      quantity: i.quantity,
    })),
    ...adjustments,
  });
}

// End of the billed time of an open session: the locked time, else now.
export const billedEndOf = (
  order: { timeLockedAt: Date | null },
  now: Date,
): Date => order.timeLockedAt ?? now;
