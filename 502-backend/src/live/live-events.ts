import { DiscountRequestStatus, Role } from '@prisma/client';

// What a screen is told over the socket: only ids (spec §7). The screen then
// calls the REST API it already uses; nothing here is business data.
export type LiveEvent =
  | { type: 'room.changed'; branchId: number; roomId: number }
  | { type: 'order.changed'; branchId: number; orderId: number }
  | { type: 'discount.requested'; branchId: number; requestId: number }
  | {
      type: 'discount.decided';
      branchId: number;
      orderId: number;
      requestId: number;
      status: DiscountRequestStatus;
    };

// The part of the account a socket is registered under.
export interface LiveUser {
  id: number;
  role: Role;
  branchId: number | null;
}
