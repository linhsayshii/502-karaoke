import { Role } from '@prisma/client';
import { AuthUser } from '../auth/auth-user';

export const SERVE_FORBIDDEN = 'Bạn chỉ thao tác được phòng mình phục vụ';

// The floor staff member assigned as server (phục vụ) of a session: orders
// for it, brings PR/KTV in and locks its time — for that room only. Checked
// under the order's row lock. The CSKH of the room only looks.
export function isServerOf(
  user: Pick<AuthUser, 'id' | 'role'>,
  order: { serverId: number | null },
) {
  return user.role === Role.STAFF && order.serverId === user.id;
}
