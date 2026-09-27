-- Số hóa đơn: DDMM of the business day + 4-digit room code + the day's
-- sequence in the branch, e.g. 27093020001 (see src/orders/bill-number.ts).
-- Every closed bill (paid or cancelled) has one; BillCounter hands out the
-- next sequence. Generated with `prisma migrate diff`, plus the backfill at
-- the end.

BEGIN;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "billNumber" TEXT,
ADD COLUMN     "billSeq" INTEGER,
ADD COLUMN     "businessDate" DATE;

-- CreateTable
CREATE TABLE "BillCounter" (
    "branchId" INTEGER NOT NULL,
    "businessDate" DATE NOT NULL,
    "lastSeq" INTEGER NOT NULL,

    CONSTRAINT "BillCounter_pkey" PRIMARY KEY ("branchId","businessDate")
);

-- CreateIndex
CREATE INDEX "Order_branchId_billNumber_idx" ON "Order"("branchId", "billNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Order_branchId_businessDate_billSeq_key" ON "Order"("branchId", "businessDate", "billSeq");

-- AddForeignKey
ALTER TABLE "BillCounter" ADD CONSTRAINT "BillCounter_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: number the bills already closed, in the order they were closed.
-- Timestamps are stored in UTC; the business day (06:00 → 06:00) is counted
-- in Vietnam time, like the server (TZ=Asia/Ho_Chi_Minh).
WITH closed AS (
    SELECT o."id",
           o."branchId",
           COALESCE(o."endTime", o."cancelledAt", o."updatedAt") AS "closedAt",
           substring(r."name" FROM '(\d+)\D*$') AS "roomDigits"
    FROM "Order" o
    LEFT JOIN "Room" r ON r."id" = o."roomId"
    WHERE o."status" <> 'PENDING'
), dated AS (
    SELECT *,
           (("closedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Ho_Chi_Minh'
               - INTERVAL '6 hours')::date AS "day"
    FROM closed
), numbered AS (
    SELECT *,
           row_number() OVER (
               PARTITION BY "branchId", "day" ORDER BY "closedAt", "id"
           ) AS "seq"
    FROM dated
)
UPDATE "Order" o
SET "businessDate" = n."day",
    "billSeq" = n."seq",
    "billNumber" = to_char(n."day", 'DDMM')
        || CASE
               WHEN n."roomDigits" IS NULL THEN '0000'
               WHEN length(n."roomDigits") >= 4 THEN right(n."roomDigits", 4)
               ELSE rpad(n."roomDigits", 4, '0')
           END
        || CASE
               WHEN n."seq" < 1000 THEN lpad(n."seq"::text, 3, '0')
               ELSE n."seq"::text
           END
FROM numbered n
WHERE o."id" = n."id";

INSERT INTO "BillCounter" ("branchId", "businessDate", "lastSeq")
SELECT "branchId", "businessDate", max("billSeq")
FROM "Order"
WHERE "billSeq" IS NOT NULL
GROUP BY "branchId", "businessDate";

COMMIT;
