import { PrismaClient, Role, StaffPosition } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const BRANCHES = [
  { code: 'cs1', name: 'Cơ sở 1' },
  { code: 'cs2', name: 'Cơ sở 2' },
  { code: 'cs3', name: 'Cơ sở 3' },
  { code: 'cs4', name: 'Cơ sở 4' },
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
