import { Prisma } from '@prisma/client';
import { BUSINESS_DAY_START_HOUR, businessDayRange } from '../common/dates';

// SQL pieces of the reports, for $queryRaw (always parameterised).
// Prisma stores DateTime as UTC `timestamp(3)`, so a column is moved to the
// time zone the server computes business days in (common/dates.ts works in
// the process's local time) before its date is taken.

// The time zone of JS local time, i.e. of businessDateOf(). Prefers
// process.env.TZ verbatim: Node respects it for all local-time computations,
// and Postgres's zoneinfo only knows the canonical IANA name (e.g.
// "Asia/Ho_Chi_Minh"), whereas ICU's own canonicalisation of the same
// identifier via Intl.DateTimeFormat (used when TZ is unset, i.e. the OS
// default applies) can return a legacy alias Postgres does not recognise
// (observed: "Asia/Saigon", rejected with error 22023).
const localTimeZone = () =>
  process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone;

// A JS Date as a UTC `timestamp` (the cast drops the ISO "Z").
const utcTimestamp = (date: Date) =>
  Prisma.sql`${date.toISOString()}::timestamp`;

const DAY_START = Prisma.raw(`interval '${BUSINESS_DAY_START_HOUR} hours'`);

// Local wall-clock time of a UTC timestamp column (the time zone of
// businessDateOf()).
export function localTimeSql(column: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`((${column} AT TIME ZONE 'UTC') AT TIME ZONE ${localTimeZone()})`;
}

// YYYY-MM-DD business day of a timestamp column.
export function businessDateSql(column: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`to_char(${localTimeSql(column)} - ${DAY_START}, 'YYYY-MM-DD')`;
}

// ISO weekday (1 = Monday … 7 = Sunday) of the business day of a column:
// a session started at 01:00 on Saturday belongs to Friday.
export function businessWeekdaySql(column: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`EXTRACT(ISODOW FROM ${localTimeSql(column)} - ${DAY_START})::int`;
}

// Local hour (0–23) of a timestamp column.
export function localHourSql(column: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`EXTRACT(HOUR FROM ${localTimeSql(column)})::int`;
}

// Paid bills (`"Order" o`) of the business days from..to, by payment time;
// every branch when branchId is undefined.
export function paidOrdersWhere(
  branchId: number | undefined,
  from: string,
  to: string,
): Prisma.Sql {
  const range = businessDayRange(from, to);
  const branch =
    branchId === undefined
      ? Prisma.empty
      : Prisma.sql`AND o."branchId" = ${branchId}`;
  return Prisma.sql`o."status" = 'COMPLETED'
    AND o."endTime" >= ${utcTimestamp(range.gte!)}
    AND o."endTime" < ${utcTimestamp(range.lt!)}
    ${branch}`;
}

// The RevenueSums columns of a group of `"Order" o` rows. Room minutes are
// started minutes, as the bill counts them.
export const REVENUE_COLUMNS = Prisma.sql`
  COUNT(*)::int AS "orderCount",
  COALESCE(SUM(CEIL(EXTRACT(EPOCH FROM (o."endTime" - o."startTime")) / 60)), 0)::float8 AS "roomMinutes",
  COALESCE(SUM(o."hourlyFee"), 0)::float8 AS "roomFee",
  COALESCE(SUM(o."totalProductPrice"), 0)::float8 AS "productSales",
  COALESCE(SUM(o."hourlyDiscountAmount"), 0)::float8 AS "roomDiscount",
  COALESCE(SUM(o."discountAmount"), 0)::float8 AS "productDiscount",
  COALESCE(SUM(o."serviceFeeAmount"), 0)::float8 AS "serviceFee",
  COALESCE(SUM(o."taxAmount"), 0)::float8 AS "vat",
  COALESCE(SUM(o."finalAmount"), 0)::float8 AS "collected",
  COALESCE(SUM(o."finalAmount") FILTER (WHERE o."paymentMethod" IS DISTINCT FROM 'TRANSFER'), 0)::float8 AS "cash",
  COALESCE(SUM(o."finalAmount") FILTER (WHERE o."paymentMethod" = 'TRANSFER'), 0)::float8 AS "transfer"`;
