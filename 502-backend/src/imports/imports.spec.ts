import { BadRequestException, Logger } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { AuthUser } from '../auth/auth-user';
import { BranchScopeService } from '../common/branch-scope.service';
import { InventoryService } from '../inventory/inventory.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { OnDuplicate } from './dto/import.dto';
import {
  mergeCost,
  normalizeName,
  summarize,
  uniqueUsername,
  usernameBase,
} from './import-utils';
import { ImportsService } from './imports.service';

describe('import utils', () => {
  it('matches names ignoring case and spaces but not diacritics', () => {
    expect(normalizeName('  Bia   TIGER ')).toBe(normalizeName('bia tiger'));
    expect(normalizeName('Bia')).not.toBe(normalizeName('Bìa'));
  });

  it('builds usernames from Vietnamese names', () => {
    expect(usernameBase('Nguyễn Văn An')).toBe('nguyen.van.an');
    expect(usernameBase('Đặng Thị Đào')).toBe('dang.thi.dao');
    expect(usernameBase('Lê')).toBe('nv.le');
    expect(usernameBase('!!!')).toBe('nv.moi');
    expect(usernameBase('a'.repeat(50))).toHaveLength(28);
  });

  it('numbers taken usernames', () => {
    const taken = new Set(['nguyen.van.an', 'nguyen.van.an2']);
    expect(uniqueUsername('nguyen.van.an', taken)).toBe('nguyen.van.an3');
    expect(uniqueUsername('nguyen.van.an', taken)).toBe('nguyen.van.an4');
    expect(uniqueUsername('le.an', taken)).toBe('le.an');
  });

  it('merges stock lines with a weighted average cost', () => {
    expect(
      mergeCost(
        { quantity: 10, unitCost: 10000 },
        { quantity: 30, unitCost: 12000 },
      ),
    ).toEqual({ quantity: 40, unitCost: 11500 });
    expect(
      mergeCost({ quantity: 1, unitCost: 10 }, { quantity: 2, unitCost: 0 }),
    ).toEqual({ quantity: 3, unitCost: 3.33 });
  });

  it('counts actions', () => {
    expect(
      summarize([
        { row: 2, name: 'a', action: 'CREATE' },
        { row: 3, name: 'b', action: 'CREATE' },
        { row: 4, name: 'c', action: 'SKIP' },
        { row: 5, name: 'd', action: 'ERROR' },
      ]),
    ).toEqual({ create: 2, update: 0, skip: 1, error: 1 });
  });
});

describe('ImportsService', () => {
  const cs1 = { id: 1, code: 'cs1', name: 'Cơ sở 1' };
  const manager: AuthUser = {
    id: 9,
    username: 'ql_cs1',
    fullName: 'Quản lý',
    role: Role.BRANCH_MANAGER,
    position: null,
    managesPr: false,
    reportAccess: false,
    branchId: 1,
    branch: cs1,
  };

  const product = (id: number, name: string, extra = {}) => ({
    id,
    branchId: 1,
    name,
    unit: 'lon',
    price: new Prisma.Decimal(20000),
    costPrice: new Prisma.Decimal(12000),
    stockQuantity: 5,
    trackStock: true,
    active: true,
    categoryId: 1,
    ...extra,
  });

  const db = {
    product: { findMany: jest.fn() },
    category: { findMany: jest.fn() },
    room: { findMany: jest.fn() },
    user: { findMany: jest.fn() },
    branch: { findUniqueOrThrow: jest.fn().mockResolvedValue(cs1) },
    $transaction: jest.fn(),
  };
  const tx = {
    category: { create: jest.fn(), createMany: jest.fn() },
    product: { create: jest.fn(), update: jest.fn() },
    user: { createMany: jest.fn(), update: jest.fn() },
  };
  const users = { checkAssignment: jest.fn() };
  const inventory = { writeDocument: jest.fn() };
  const service = new ImportsService(
    db as unknown as PrismaService,
    {
      resolveBranchId: jest.fn().mockResolvedValue(1),
    } as unknown as BranchScopeService,
    inventory as unknown as InventoryService,
    users as unknown as UsersService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    db.category.findMany.mockResolvedValue([{ id: 1, name: 'Đồ uống' }]);
    db.product.findMany.mockResolvedValue([
      product(1, 'Bia Tiger'),
      product(2, 'Nước suối', { trackStock: false, stockQuantity: 0 }),
    ]);
    // The write runs the plan again on the transaction client.
    db.$transaction.mockImplementation((fn: (t: unknown) => unknown) =>
      fn({
        ...db,
        category: { ...db.category, ...tx.category },
        product: { ...db.product, ...tx.product },
        user: { ...db.user, ...tx.user },
      }),
    );
    tx.category.create.mockImplementation(({ data }: { data: object }) => ({
      id: 50,
      ...data,
    }));
    tx.product.create.mockImplementation(({ data }: { data: object }) => ({
      id: 70,
      ...data,
    }));
  });

  describe('products', () => {
    const rows = [
      { row: 2, name: 'bia tiger', price: 25000 },
      {
        row: 3,
        name: 'Khô mực',
        unit: 'đĩa',
        price: 80000,
        categoryName: 'Đồ nhắm',
      },
      { row: 4, name: 'Khô mực', unit: 'đĩa', price: 80000 },
      { row: 5, name: 'Đậu phộng' },
      { row: 6, name: '  ' },
    ];

    it('classifies rows in a dry run without writing', async () => {
      const res = await service.importProducts(manager, 'cs1', {
        dryRun: true,
        onDuplicate: OnDuplicate.UPDATE,
        createCategories: true,
        rows,
      });
      expect(res.rows.map((r) => [r.row, r.action, r.message])).toEqual([
        [2, 'UPDATE', 'giá 20.000 → 25.000'],
        [3, 'CREATE', 'Tạo cả danh mục "Đồ nhắm"'],
        [4, 'ERROR', 'Trùng với dòng 3'],
        [5, 'ERROR', 'Thiếu đơn vị tính, giá bán để tạo sản phẩm mới'],
        [6, 'ERROR', 'Thiếu tên sản phẩm'],
      ]);
      expect(res.summary).toEqual({ create: 1, update: 1, skip: 0, error: 3 });
      expect(db.$transaction).not.toHaveBeenCalled();
    });

    it('skips existing products and refuses unknown categories when asked', async () => {
      const res = await service.importProducts(manager, 'cs1', {
        dryRun: true,
        onDuplicate: OnDuplicate.SKIP,
        createCategories: false,
        rows: rows.slice(0, 2),
      });
      expect(res.rows.map((r) => [r.action, r.message])).toEqual([
        ['SKIP', 'Sản phẩm đã có'],
        ['ERROR', 'Chưa có danh mục "Đồ nhắm"'],
      ]);
    });

    it('refuses to untrack a product that still has stock', async () => {
      const res = await service.importProducts(manager, 'cs1', {
        dryRun: true,
        onDuplicate: OnDuplicate.UPDATE,
        createCategories: false,
        rows: [{ row: 2, name: 'Bia Tiger', trackStock: false }],
      });
      expect(res.rows[0].action).toBe('ERROR');
      expect(res.rows[0].message).toContain('Còn tồn kho 5 lon');
    });

    it('writes nothing when a row is invalid', async () => {
      await expect(
        service.importProducts(manager, 'cs1', {
          dryRun: false,
          onDuplicate: OnDuplicate.UPDATE,
          createCategories: true,
          rows,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.product.create).not.toHaveBeenCalled();
      expect(tx.category.create).not.toHaveBeenCalled();
    });

    it('creates the new category before its products', async () => {
      await service.importProducts(manager, 'cs1', {
        dryRun: false,
        onDuplicate: OnDuplicate.UPDATE,
        createCategories: true,
        rows: rows.slice(0, 2),
      });
      expect(tx.category.create).toHaveBeenCalledWith({
        data: { branchId: 1, name: 'Đồ nhắm' },
      });
      expect(tx.product.create).toHaveBeenCalledWith({
        data: {
          name: 'Khô mực',
          unit: 'đĩa',
          price: 80000,
          trackStock: true,
          branchId: 1,
          categoryId: 50,
        },
      });
      expect(tx.product.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { price: 25000 },
      });
    });
  });

  describe('stock import', () => {
    it('merges rows of a product and creates missing products on one phiếu', async () => {
      inventory.writeDocument.mockResolvedValue({
        id: 3,
        code: 'PN-CS1-20260927-0003',
        totalAmount: new Prisma.Decimal(1000),
      });
      const res = await service.importStock(manager, 'cs1', {
        dryRun: false,
        createProducts: true,
        paymentMethod: 'CASH',
        rows: [
          { row: 2, productName: 'Bia Tiger', quantity: 10, unitCost: 10000 },
          {
            row: 3,
            productName: 'Snack',
            quantity: 5,
            unit: 'gói',
            price: 15000,
          },
          { row: 4, productName: 'bia tiger', quantity: 30, unitCost: 12000 },
        ],
      });
      expect(res.rows.map((r) => [r.action, r.message])).toEqual([
        ['UPDATE', '40 lon × 11.500 · tồn 5 → 45'],
        ['CREATE', 'Sản phẩm mới · 5 gói × 0'],
        ['UPDATE', 'Gộp vào dòng 2'],
      ]);
      expect(inventory.writeDocument).toHaveBeenCalledWith(
        expect.anything(),
        manager,
        cs1,
        expect.objectContaining({ type: 'IMPORT', paymentMethod: 'CASH' }),
        [
          { productId: 1, quantity: 40, unitCost: 11500 },
          { productId: 70, quantity: 5, unitCost: 0 },
        ],
      );
      expect(res).toMatchObject({
        totalAmount: 460000,
        document: { code: 'PN-CS1-20260927-0003' },
      });
    });

    it('rejects unknown products unless asked to create them', async () => {
      const res = await service.importStock(manager, 'cs1', {
        dryRun: true,
        createProducts: false,
        rows: [
          { row: 2, productName: 'Snack', quantity: 5 },
          { row: 3, productName: 'Nước suối', quantity: 5 },
          { row: 4, productName: 'Bia Tiger', quantity: 0 },
        ],
      });
      expect(res.rows.map((r) => r.message)).toEqual([
        'Chưa có sản phẩm "Snack"',
        'Sản phẩm không quản lý tồn kho',
        'Thiếu số lượng (số nguyên từ 1)',
      ]);
    });
  });

  describe('accounts', () => {
    beforeEach(() => {
      db.user.findMany.mockResolvedValue([
        {
          id: 9,
          username: 'ql_cs1',
          fullName: 'Quản lý',
          phone: null,
          role: Role.BRANCH_MANAGER,
          position: null,
          branchId: 1,
          active: true,
        },
        {
          id: 10,
          username: 'nguyen.van.an',
          fullName: 'Nguyễn Văn An',
          phone: null,
          role: Role.STAFF,
          position: null,
          branchId: 2,
          active: true,
        },
      ]);
      users.checkAssignment.mockImplementation((_actor, role: Role) => {
        if (role === Role.BRANCH_MANAGER) {
          throw new BadRequestException('Không được giao vai trò này');
        }
      });
    });

    it('generates free usernames and checks the roles the actor may give', async () => {
      const res = await service.importUsers(manager, 'cs1', {
        dryRun: true,
        onDuplicate: OnDuplicate.UPDATE,
        rows: [
          { row: 2, fullName: 'Nguyễn Văn An', position: 'SERVER' },
          { row: 3, fullName: 'Trần Bình', role: Role.BRANCH_MANAGER },
          { row: 4, fullName: 'Quản lý', phone: '0909' },
          { row: 5, fullName: 'Ai đó', username: 'nguyen.van.an' },
          { row: 6, fullName: 'Lê C', username: 'Sai Tên' },
        ],
      });
      expect(res.rows.map((r) => [r.action, r.message])).toEqual([
        ['CREATE', 'Tên đăng nhập: nguyen.van.an2'],
        ['ERROR', 'Không được giao vai trò này'],
        ['ERROR', 'Bạn không có quyền sửa tài khoản ql_cs1'],
        ['ERROR', 'Tên đăng nhập "nguyen.van.an" đã được dùng ở cơ sở khác'],
        [
          'ERROR',
          'Tên đăng nhập "sai tên" chỉ gồm 3–32 chữ thường không dấu, số, dấu chấm, gạch dưới',
        ],
      ]);
    });

    it('turns "Vào trang báo cáo" off when an account moves to a role without it', async () => {
      const chainManager: AuthUser = {
        ...manager,
        id: 1,
        role: Role.CHAIN_MANAGER,
        branchId: null,
        branch: null,
      };
      const account = (
        id: number,
        username: string,
        reportAccess: boolean,
      ) => ({
        id,
        username,
        fullName: username,
        phone: null,
        role: Role.BRANCH_MANAGER,
        position: null,
        reportAccess,
        branchId: 1,
        active: true,
      });
      db.user.findMany.mockResolvedValue([
        account(20, 'ql_co_quyen', true),
        account(21, 'ql_khong_quyen', false),
      ]);
      const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
      const dto = {
        onDuplicate: OnDuplicate.UPDATE,
        rows: [
          {
            row: 2,
            fullName: 'ql_co_quyen',
            username: 'ql_co_quyen',
            role: Role.CASHIER,
          },
          {
            row: 3,
            fullName: 'ql_khong_quyen',
            username: 'ql_khong_quyen',
            role: Role.STAFF,
          },
        ],
      };

      // The check only tells; nothing is written or logged.
      const dry = await service.importUsers(chainManager, 'cs1', {
        ...dto,
        dryRun: true,
      });
      expect(dry.rows.map((r) => r.message)).toEqual([
        'ql_co_quyen: đổi vai trò; tắt quyền vào trang báo cáo',
        'ql_khong_quyen: đổi vai trò',
      ]);
      expect(log).not.toHaveBeenCalled();

      await service.importUsers(chainManager, 'cs1', { ...dto, dryRun: false });
      expect(tx.user.update).toHaveBeenCalledWith({
        where: { id: 20 },
        data: { role: Role.CASHIER, reportAccess: false },
      });
      expect(tx.user.update).toHaveBeenCalledWith({
        where: { id: 21 },
        data: { role: Role.STAFF },
      });
      expect(log).toHaveBeenCalledTimes(1);
      expect(log).toHaveBeenCalledWith('User 20: report access off by user 1');
      log.mockRestore();
    });
  });
});
