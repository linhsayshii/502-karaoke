import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/auth-user';
import { BranchScopeService } from '../common/branch-scope.service';
import { dayCount } from './buckets';
import { occupancy, rank } from './breakdowns';
import {
  addSums,
  emptySums,
  RevenueMetrics,
  RevenueSums,
  sumAll,
  toMetrics,
} from './revenue-metrics';
import { paidOrdersWhere, REVENUE_COLUMNS } from './report-sql';
import { reportScope } from './report-scope';
import {
  RoomGroup,
  RoomReportQuery,
  StaffReportQuery,
  StaffRole,
} from './dto/report-query';

interface Range {
  from: string;
  to: string;
}

// id null: the bills nobody was assigned to in that role (Chưa gán).
export interface StaffRow extends RevenueMetrics {
  id: number | null;
  name: string | null;
  username: string | null;
  branchCode: string | null;
}

export interface StaffReport {
  branchId: number | null; // null: the whole chain
  range: Range;
  role: StaffRole;
  totals: RevenueMetrics;
  rows: StaffRow[];
}

// A room (by=room) or a room type (by=type, id = the type); id null: the
// bills without a room (Không phòng).
export interface RoomRow extends RevenueMetrics {
  id: number | string | null;
  name: string | null;
  type: string | null;
  branchCode: string | null; // by=room only
  rooms: number;
  occupancy: number | null;
}

export interface RoomReport {
  branchId: number | null;
  range: Range;
  by: RoomGroup;
  days: number;
  totals: RevenueMetrics;
  occupancy: number | null; // of all the rooms together
  rows: RoomRow[];
}

// The person a bill is credited to in each staff report (fixed column
// names, never user input).
const STAFF_COLUMNS: Record<StaffRole, Prisma.Sql> = {
  cskh: Prisma.raw('o."cskhId"'),
  server: Prisma.raw('o."serverId"'),
  cashier: Prisma.raw('o."checkedOutById"'),
};

// Revenue of the paid bills broken down by a subject. Every report's rows
// add up to the revenue report's totals of the same scope and days.
@Injectable()
export class BreakdownReportsService {
  constructor(
    private prisma: PrismaService,
    private branchScope: BranchScopeService,
  ) {}

  // Each bill counts in full for its CSKH, its server and its cashier.
  async staff(user: AuthUser, query: StaffReportQuery): Promise<StaffReport> {
    const branchId = await reportScope(this.branchScope, user, query);
    const role = query.role ?? 'cskh';
    const sums = await this.prisma.$queryRaw<
      (RevenueSums & { userId: number | null })[]
    >`
      SELECT ${STAFF_COLUMNS[role]} AS "userId", ${REVENUE_COLUMNS}
      FROM "Order" o
      WHERE ${paidOrdersWhere(branchId, query.from, query.to)}
      GROUP BY 1`;

    const users = await this.prisma.user.findMany({
      where: {
        id: {
          in: sums.flatMap((row) => (row.userId === null ? [] : [row.userId])),
        },
      },
      select: {
        id: true,
        fullName: true,
        username: true,
        branch: { select: { code: true } },
      },
    });
    const userOf = new Map(users.map((u) => [u.id, u]));

    const rows = sums.map((row): StaffRow => {
      const person = row.userId === null ? undefined : userOf.get(row.userId);
      return {
        id: row.userId,
        name: person?.fullName ?? null,
        username: person?.username ?? null,
        branchCode: person?.branch?.code ?? null,
        ...toMetrics(row),
      };
    });
    return {
      branchId: branchId ?? null,
      range: { from: query.from, to: query.to },
      role,
      totals: toMetrics(sumAll(sums)),
      rows: rank(rows, (r) => r.revenue),
    };
  }

  // Every room of the scope (also those without bills), or every room type.
  async rooms(user: AuthUser, query: RoomReportQuery): Promise<RoomReport> {
    const branchId = await reportScope(this.branchScope, user, query);
    const by = query.by ?? 'room';
    const days = dayCount(query.from, query.to);

    const [sums, rooms] = await Promise.all([
      this.prisma.$queryRaw<(RevenueSums & { roomId: number | null })[]>`
        SELECT o."roomId" AS "roomId", ${REVENUE_COLUMNS}
        FROM "Order" o
        WHERE ${paidOrdersWhere(branchId, query.from, query.to)}
        GROUP BY 1`,
      this.prisma.room.findMany({
        where: { branchId },
        orderBy: [{ branchId: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          type: true,
          branch: { select: { code: true } },
        },
      }),
    ]);
    const sumsOf = new Map(sums.map((row) => [row.roomId, row]));

    const groups = new Map<
      number | string,
      Omit<RoomRow, keyof RevenueMetrics | 'occupancy'> & { sums: RevenueSums }
    >();
    for (const room of rooms) {
      const id = by === 'room' ? room.id : room.type;
      const group = groups.get(id) ?? {
        id,
        name: by === 'room' ? room.name : room.type,
        type: room.type,
        branchCode: by === 'room' ? room.branch.code : null,
        rooms: 0,
        sums: emptySums(),
      };
      group.rooms += 1;
      addSums(group.sums, sumsOf.get(room.id) ?? emptySums());
      groups.set(id, group);
    }

    const rows: RoomRow[] = [...groups.values()].map(
      ({ sums: own, ...group }) => ({
        ...group,
        occupancy: occupancy(own.roomMinutes, days, group.rooms),
        ...toMetrics(own),
      }),
    );
    const inRooms = sumAll(rows);
    const withoutRoom = sumsOf.get(null);
    if (withoutRoom) {
      rows.push({
        id: null,
        name: null,
        type: null,
        branchCode: null,
        rooms: 0,
        occupancy: null,
        ...toMetrics(withoutRoom),
      });
    }
    return {
      branchId: branchId ?? null,
      range: { from: query.from, to: query.to },
      by,
      days,
      totals: toMetrics(sumAll(sums)),
      occupancy: occupancy(inRooms.roomMinutes, days, rooms.length),
      rows: rank(rows, (r) => r.revenue),
    };
  }
}
