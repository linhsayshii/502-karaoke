import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { BranchScopeService } from './branch-scope.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/auth-user';

const cs1 = { id: 1, code: 'cs1', name: 'Cơ sở 1' };
const user = (role: Role, branch: typeof cs1 | null = cs1): AuthUser => ({
  id: 7,
  username: 'u',
  fullName: 'U',
  role,
  position: null,
  managesPr: false,
  branchId: branch?.id ?? null,
  branch,
});

describe('BranchScopeService', () => {
  const findUnique = jest.fn();
  const service = new BranchScopeService({
    branch: { findUnique },
  } as unknown as PrismaService);

  beforeEach(() => findUnique.mockReset());

  describe.each([Role.BRANCH_MANAGER, Role.CASHIER, Role.STAFF])(
    '%s',
    (role) => {
      it('uses the account branch when none is given', async () => {
        await expect(service.resolveBranchId(user(role))).resolves.toBe(1);
        expect(findUnique).not.toHaveBeenCalled();
      });

      it('accepts its own branch code', async () => {
        await expect(service.resolveBranchId(user(role), 'cs1')).resolves.toBe(
          1,
        );
      });

      it('rejects another branch code', async () => {
        await expect(
          service.resolveBranchId(user(role), 'cs2'),
        ).rejects.toThrow(ForbiddenException);
      });

      it('rejects records of another branch', () => {
        expect(() => service.assertBranchAccess(user(role), 2)).toThrow(
          ForbiddenException,
        );
        expect(() => service.assertBranchAccess(user(role), 1)).not.toThrow();
      });
    },
  );

  it('rejects an account without a branch', async () => {
    await expect(
      service.resolveBranchId(user(Role.CASHIER, null)),
    ).rejects.toThrow(ForbiddenException);
  });

  describe('chain manager', () => {
    const chain = user(Role.CHAIN_MANAGER, null);

    it('must pick a branch for scoped endpoints', async () => {
      await expect(service.resolveBranchId(chain)).rejects.toThrow(
        BadRequestException,
      );
      await expect(
        service.resolveOptionalBranchId(chain),
      ).resolves.toBeUndefined();
    });

    it('resolves any branch by code', async () => {
      findUnique.mockResolvedValue({ id: 3, code: 'cs3' });
      await expect(service.resolveBranchId(chain, 'cs3')).resolves.toBe(3);
      expect(() => service.assertBranchAccess(chain, 3)).not.toThrow();
    });

    it('fails on an unknown code', async () => {
      findUnique.mockResolvedValue(null);
      await expect(service.resolveBranchId(chain, 'x')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
