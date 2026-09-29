import { PrismaClient, Role, StaffPosition } from '@prisma/client';
import * as bcrypt from 'bcrypt';

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

// Cơ sở 5: floors 2–6, rooms x01–x09 (no 408), all VIP. Price per hour by room.
const CS5_PRICE_990 = new Set([204, 304, 308, 404, 504, 508, 604, 608]);
const CS5_PRICE_1100 = new Set([208, 601]);
const CS5_ROOMS: { name: string; pricePerHour: number }[] = [];
for (let floor = 2; floor <= 6; floor++) {
  for (let n = 1; n <= 9; n++) {
    const code = floor * 100 + n;
    if (code === 408) continue;
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

// Only when the branch has no rooms yet, so re-running never overwrites edited prices.
async function seedCs5Rooms(branchIds: Map<string, number>) {
  const branchId = branchIds.get('cs5')!;
  if ((await prisma.room.count({ where: { branchId } })) > 0) return;
  await prisma.room.createMany({
    data: CS5_ROOMS.map((r) => ({ branchId, type: 'VIP', ...r })),
  });
  console.log(`Rooms ready for cs5: ${CS5_ROOMS.length}`);
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
  await seedCs5Rooms(branchIds);

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
