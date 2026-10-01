import { PrismaClient, Role, StaffPosition } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { normalizeName } from '../src/imports/import-utils';

const prisma = new PrismaClient();

const BRANCHES = [
  { code: 'cs1', name: 'Cơ sở 1' },
  { code: 'cs2', name: 'Cơ sở 2' },
  { code: 'cs3', name: 'Cơ sở 3' },
  { code: 'cs4', name: 'Cơ sở 4' },
  { code: 'cs5', name: 'Cơ sở 5' },
];

// Every seeded account gets this password; change it after the first login.
const DEFAULT_PASSWORD = '12345678';

type SeedUser = {
  username: string;
  fullName: string;
  role: Role;
  branch?: string;
  position?: StaffPosition;
};

// Created on every seed.
const USERS: SeedUser[] = [
  { username: 'admin', fullName: 'Quản lý hệ thống', role: Role.CHAIN_MANAGER },
  {
    username: 'ql1_cs1',
    fullName: 'Quản lý CS1',
    role: Role.BRANCH_MANAGER,
    branch: 'cs1',
  },
  {
    username: 'tn1_cs1',
    fullName: 'Thu ngân CS1',
    role: Role.CASHIER,
    branch: 'cs1',
  },
  {
    username: 'pv1_cs1',
    fullName: 'Phục vụ CS1',
    role: Role.STAFF,
    branch: 'cs1',
    position: StaffPosition.SERVER,
  },
  {
    username: 'ql1_cs5',
    fullName: 'Quản lý CS5',
    role: Role.BRANCH_MANAGER,
    branch: 'cs5',
  },
  {
    username: 'tn1_cs5',
    fullName: 'Thu ngân CS5',
    role: Role.CASHIER,
    branch: 'cs5',
  },
  {
    username: 'cskh1_cs5',
    fullName: 'CSKH CS5',
    role: Role.STAFF,
    branch: 'cs5',
    position: StaffPosition.CSKH,
  },
  {
    username: 'pv1_cs5',
    fullName: 'Phục vụ CS5',
    role: Role.STAFF,
    branch: 'cs5',
    position: StaffPosition.SERVER,
  },
];

// Extra demo accounts, created only with SEED_DEMO=1.
const DEMO_USERS: SeedUser[] = [
  {
    username: 'cskh1_cs1',
    fullName: 'CSKH CS1',
    role: Role.STAFF,
    branch: 'cs1',
    position: StaffPosition.CSKH,
  },
  {
    username: 'ql1_cs2',
    fullName: 'Quản lý CS2',
    role: Role.BRANCH_MANAGER,
    branch: 'cs2',
  },
  {
    username: 'tn1_cs2',
    fullName: 'Thu ngân CS2',
    role: Role.CASHIER,
    branch: 'cs2',
  },
  {
    username: 'pv1_cs2',
    fullName: 'Phục vụ CS2',
    role: Role.STAFF,
    branch: 'cs2',
    position: StaffPosition.SERVER,
  },
];

// Existing accounts are left untouched, so re-running never resets a password.
async function seedUsers(users: SeedUser[], branchIds: Map<string, number>) {
  const password = await bcrypt.hash(DEFAULT_PASSWORD, 10);
  for (const u of users) {
    await prisma.user.upsert({
      where: { username: u.username },
      update: {},
      create: {
        username: u.username,
        password,
        fullName: u.fullName,
        role: u.role,
        position: u.position,
        branchId: u.branch ? branchIds.get(u.branch)! : null,
      },
    });
  }
  console.log(
    `Accounts ready (password ${DEFAULT_PASSWORD}): ${users.map((u) => u.username).join(', ')}`,
  );
}

// Cơ sở 5: floors 2–6, rooms x01–x09, all VIP. Price per hour by room.
const CS5_PRICE_990 = new Set([204, 304, 308, 404, 408, 504, 508, 604, 608]);
const CS5_PRICE_1100 = new Set([208, 601]);
const CS5_ROOMS: { name: string; pricePerHour: number }[] = [];
for (let floor = 2; floor <= 6; floor++) {
  for (let n = 1; n <= 9; n++) {
    const code = floor * 100 + n;
    CS5_ROOMS.push({
      name: String(code),
      pricePerHour: CS5_PRICE_1100.has(code)
        ? 1100000
        : CS5_PRICE_990.has(code)
          ? 990000
          : 690000,
    });
  }
}

// [name, price, unit, trackStock]; trackStock false for what is made to order
// (pha chế, hoa quả, đồ nướng, bánh sinh nhật, combo), which has no stock.
type SeedProduct = [
  name: string,
  price: number,
  unit: string,
  trackStock?: boolean,
];

// Cơ sở 5 menu, from its product list (Danh_sach_san_pham.xlsx), names spelled
// as the brands write them; "(2)" marks a second price of the same product.
const CS5_CATALOG: { category: string; products: SeedProduct[] }[] = [
  {
    category: 'Bia',
    products: [
      ['Bia Budweiser chai nhôm', 105000, 'Chai'],
      ['Bia Budweiser chai nhôm (2)', 95000, 'Chai'],
      ['Bia Corona Extra 250ml', 69000, 'Chai'],
      ['Bia Corona Extra 250ml (2)', 65000, 'Lon'],
      ['Bia Heineken', 60000, 'Lon'],
      ['Bia Heineken (2)', 50000, 'Lon'],
      ['Bia Heineken 0 độ', 55000, 'Lon'],
      ['Bia Tiger Bạc', 60000, 'Lon'],
      ['Bia Tiger Bạc (2)', 50000, 'Lon'],
      ['Combo Corona', 4536000, 'Combo', false],
    ],
  },
  {
    category: 'Rượu, vang',
    products: [
      ['Chivas Regal 18', 2990000, 'Chai'],
      ['Chivas Regal 21', 5990000, 'Chai'],
      ['Macallan 12', 4699000, 'Chai'],
      ['Macallan 18', 16500000, 'Chai'],
      ['Macallan 1824 Gold', 5990000, 'Chai'],
      ['Vang Château Hyon La Fleur Saint-Émilion', 5800000, 'Chai'],
      ["Vang Spinelli Montepulciano d'Abruzzo (vang đỏ Ý)", 1450000, 'Chai'],
      ['Vang Primitivo Puglia IGP (vang đỏ Ý)', 1950000, 'Chai'],
      ['Vang Primitivo Puglia IGP (vang đỏ Ý) (2)', 1650000, 'Chai'],
    ],
  },
  {
    category: 'Nước giải khát',
    products: [
      ['Nước suối', 25000, 'Chai'],
      ['Nước suối kiềm ION', 25000, 'Chai'],
      ['Coca-Cola', 30000, 'Lon'],
      ['Pepsi', 30000, 'Lon'],
      ['Bò húc (Red Bull)', 30000, 'Lon'],
    ],
  },
  {
    category: 'Nước ép, sinh tố, trà',
    products: [
      ['Nước cam nguyên chất', 70000, 'Ly', false],
      ['Nước chanh tươi', 45000, 'Ly', false],
      ['Nước dưa hấu', 50000, 'Ly', false],
      ['Sinh tố xoài', 80000, 'Ly', false],
      ['Trà gừng', 50000, 'Ly', false],
    ],
  },
  {
    category: 'Đồ uống bổ dưỡng',
    products: [
      ['Nước collagen', 90000, 'Lọ'],
      ['Nước yến', 90000, 'Lọ'],
      ['Hồng sâm Hàn Quốc', 80000, 'Chai'],
      ['Nước sâm Hàn Quốc', 30000, 'Lọ'],
      ['Trà sâm thảo mộc', 50000, 'Chai'],
      ['Nước giải rượu thảo mộc', 85000, 'Lọ'],
      ['Nước nghệ thải độc', 90000, 'Lọ'],
    ],
  },
  {
    category: 'Hoa quả',
    products: [
      ['Hoa quả nhỏ', 450000, 'Đĩa', false],
      ['Hoa quả ổi', 250000, 'Đĩa', false],
      ['Hoa quả thập cẩm đĩa to', 650000, 'Đĩa', false],
      ['Hoa quả thập cẩm đĩa to (2)', 450000, 'Đĩa', false],
    ],
  },
  {
    category: 'Đồ nhắm',
    products: [
      ['Bò khô miếng', 90000, 'Túi'],
      ['Trâu gác bếp', 250000, 'Đĩa'],
      ['Chân gà cay', 55000, 'Túi'],
      ['Nem chua', 105000, 'Túi'],
      ['Tóp mỡ cháy tỏi', 40000, 'Túi'],
      ['Trứng cút Aloca', 50000, 'Túi'],
      ['Mực nướng than hồng', 550000, 'Đĩa', false],
    ],
  },
  {
    category: 'Bánh, kẹo, hạt',
    products: [
      ['Hạt điều', 65000, 'Túi'],
      ['Hạt dẻ', 65000, 'Túi'],
      ['Hạt mắc ca', 65000, 'Túi'],
      ['Lạc rang muối', 65000, 'Túi'],
      ['Bắp giòn', 75000, 'Túi'],
      ['Bim bim mix', 45000, 'Túi'],
      ['Khoai tây hộp', 60000, 'Túi'],
      ['Rong biển', 35000, 'Túi'],
      ['Mít sấy dẻo', 60000, 'Túi'],
      ['Bánh chấm (hộp)', 50000, 'Hộp'],
      ['Bánh chấm (túi)', 50000, 'Túi'],
      ['Kẹo cao su', 70000, 'Hộp'],
      ['Kẹo ngậm bạc hà', 76000, 'Hộp'],
    ],
  },
  {
    category: 'Khác',
    products: [
      ['Bánh sinh nhật to', 500000, 'Cái', false],
      ['Khăn lạnh', 8000, 'Cái'],
      ['Thuốc lá Man', 90000, 'Hộp'],
    ],
  },
];

// Rooms and products are matched by name (as the Excel import does) and only
// the missing ones are created: re-running adds what was added here (room 408)
// without duplicating or overwriting existing rows (edited prices stay; a
// renamed or deleted one comes back under its seed name).
// Reads every room/product name of one branch: a one-off script over a
// catalogue of a few hundred rows, not a request path.
async function seedCs5Rooms(branchId: number) {
  const existing = await prisma.room.findMany({
    where: { branchId },
    select: { name: true },
  });
  const names = new Set(existing.map((r) => normalizeName(r.name)));
  const missing = CS5_ROOMS.filter((r) => !names.has(normalizeName(r.name)));
  if (missing.length === 0) return;
  await prisma.room.createMany({
    data: missing.map((r) => ({ branchId, type: 'VIP', ...r })),
  });
  console.log(`Rooms added to cs5: ${missing.map((r) => r.name).join(', ')}`);
}

async function seedCs5Catalog(branchId: number) {
  const [categories, products] = await Promise.all([
    prisma.category.findMany({
      where: { branchId },
      select: { id: true, name: true },
    }),
    // Inactive products too, so a product the branch stopped selling stays stopped.
    prisma.product.findMany({ where: { branchId }, select: { name: true } }),
  ]);
  const categoryIds = new Map(
    categories.map((c) => [normalizeName(c.name), c.id]),
  );
  const productNames = new Set(products.map((p) => normalizeName(p.name)));

  let added = 0;
  for (const group of CS5_CATALOG) {
    const missing = group.products.filter(
      ([name]) => !productNames.has(normalizeName(name)),
    );
    if (missing.length === 0) continue;
    const categoryId =
      categoryIds.get(normalizeName(group.category)) ??
      (
        await prisma.category.create({
          data: { branchId, name: group.category },
        })
      ).id;
    await prisma.product.createMany({
      data: missing.map(([name, price, unit, trackStock = true]) => ({
        branchId,
        categoryId,
        name,
        price,
        unit,
        trackStock,
      })),
    });
    added += missing.length;
  }
  if (added > 0) console.log(`Products added to cs5: ${added}`);
}

async function seedDemo(branchIds: Map<string, number>) {
  await seedUsers(DEMO_USERS, branchIds);

  for (const code of ['cs1', 'cs2']) {
    const branchId = branchIds.get(code)!;
    if ((await prisma.room.count({ where: { branchId } })) > 0) continue;

    const prefix = code === 'cs1' ? 1 : 2;
    await prisma.room.createMany({
      data: [
        {
          branchId,
          name: `P${prefix}01`,
          type: 'NORMAL',
          pricePerHour: 120000,
        },
        {
          branchId,
          name: `P${prefix}02`,
          type: 'NORMAL',
          pricePerHour: 120000,
        },
        { branchId, name: `P${prefix}03`, type: 'VIP', pricePerHour: 200000 },
      ],
    });
    const drinks = await prisma.category.create({
      data: { branchId, name: 'Đồ uống' },
    });
    const food = await prisma.category.create({
      data: { branchId, name: 'Đồ ăn' },
    });
    await prisma.product.createMany({
      data: [
        {
          branchId,
          categoryId: drinks.id,
          name: 'Bia Tiger',
          price: 25000,
          unit: 'lon',
        },
        {
          branchId,
          categoryId: drinks.id,
          name: 'Nước suối',
          price: 10000,
          unit: 'chai',
        },
        {
          branchId,
          categoryId: food.id,
          name: 'Trái cây',
          price: 150000,
          unit: 'dĩa',
        },
        {
          branchId,
          name: 'Phụ thu vệ sinh',
          price: 50000,
          unit: 'lần',
          trackStock: false,
        },
      ],
    });
  }
  console.log('Demo rooms and products ready for cs1, cs2');
}

async function main() {
  const branchIds = new Map<string, number>();
  for (const b of BRANCHES) {
    const branch = await prisma.branch.upsert({
      where: { code: b.code },
      update: {},
      create: b,
    });
    branchIds.set(branch.code, branch.id);
  }

  await seedUsers(USERS, branchIds);
  await seedCs5Rooms(branchIds.get('cs5')!);
  await seedCs5Catalog(branchIds.get('cs5')!);

  if (process.env.SEED_DEMO === '1') await seedDemo(branchIds);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
