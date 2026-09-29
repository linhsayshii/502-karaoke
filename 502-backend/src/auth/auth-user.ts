import { Role, StaffPosition } from '@prisma/client';

// The logged-in account as seen by guards and services (req.user).
// Always loaded fresh from the DB, so role/branch/active changes apply at once.
export interface AuthUser {
  id: number;
  username: string;
  fullName: string;
  role: Role;
  position: StaffPosition | null;
  managesPr: boolean;
  branchId: number | null;
  branch: { id: number; code: string; name: string } | null;
}

export const authUserSelect = {
  id: true,
  username: true,
  fullName: true,
  role: true,
  position: true,
  managesPr: true,
  branchId: true,
  branch: { select: { id: true, code: true, name: true } },
} as const;
