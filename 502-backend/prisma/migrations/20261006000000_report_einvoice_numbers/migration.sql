-- Trang báo cáo tính theo từng hóa đơn điện tử (spec
-- 2026-10-02-bao-cao-theo-tung-hddt §6).

-- 1. Every e-invoice has an invoice date, the day the report site counts it
--    on. A draft saved without one shows the calendar day its paid bill was
--    paid (defaultInvoiceDate) or the day of its bill thêm tay.
UPDATE "Einvoice" e SET "invoiceDate" = COALESCE(
    (SELECT (o."endTime" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
     FROM "Order" o WHERE o."id" = e."orderId"),
    (SELECT m."businessDate" FROM "ManualBill" m WHERE m."id" = e."manualBillId"),
    e."businessDate")
WHERE e."invoiceDate" IS NULL;
ALTER TABLE "Einvoice" ALTER COLUMN "invoiceDate" SET NOT NULL;
CREATE INDEX "Einvoice_branchId_invoiceDate_idx" ON "Einvoice"("branchId", "invoiceDate");

-- 2. The report site's numbers: one sequence per branch and invoice date.
CREATE TABLE "ReportCounter" (
    "branchId" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "lastSeq" INTEGER NOT NULL,

    CONSTRAINT "ReportCounter_pkey" PRIMARY KEY ("branchId","date")
);
ALTER TABLE "ReportCounter" ADD CONSTRAINT "ReportCounter_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Einvoice"
    ADD COLUMN "reportDate" DATE,
    ADD COLUMN "reportSeq" INTEGER,
    ADD COLUMN "reportNumber" TEXT;

-- The invoices there are numbered in the order they were made (id), per
-- branch and invoice date. The room code is roomCode() of
-- orders/bill-number.ts: the last run of digits of the room's name,
-- right-padded with 0 or cut to its last 4, 0000 without digits; then the
-- sequence with at least 3 digits (formatBillNumber).
WITH numbered AS (
    SELECT e."id", e."invoiceDate",
        row_number() OVER (PARTITION BY e."branchId", e."invoiceDate" ORDER BY e."id") AS seq,
        substring(COALESCE(
            (SELECT r."name" FROM "Order" o JOIN "Room" r ON r."id" = o."roomId" WHERE o."id" = e."orderId"),
            (SELECT r."name" FROM "ManualBill" m JOIN "Room" r ON r."id" = m."roomId" WHERE m."id" = e."manualBillId"),
            '') FROM '(\d+)\D*$') AS digits
    FROM "Einvoice" e
)
UPDATE "Einvoice" e SET
    "reportDate" = n."invoiceDate",
    "reportSeq" = n.seq,
    "reportNumber" = to_char(n."invoiceDate", 'DDMM')
        || CASE WHEN n.digits IS NULL THEN '0000'
                WHEN length(n.digits) >= 4 THEN right(n.digits, 4)
                ELSE rpad(n.digits, 4, '0') END
        || lpad(n.seq::text, GREATEST(3, length(n.seq::text)), '0')
FROM numbered n
WHERE n."id" = e."id";

INSERT INTO "ReportCounter" ("branchId", "date", "lastSeq")
SELECT "branchId", "reportDate", max("reportSeq") FROM "Einvoice" GROUP BY 1, 2;

ALTER TABLE "Einvoice"
    ALTER COLUMN "reportDate" SET NOT NULL,
    ALTER COLUMN "reportSeq" SET NOT NULL,
    ALTER COLUMN "reportNumber" SET NOT NULL;
CREATE UNIQUE INDEX "Einvoice_branchId_reportDate_reportSeq_key" ON "Einvoice"("branchId", "reportDate", "reportSeq");
CREATE INDEX "Einvoice_branchId_reportNumber_idx" ON "Einvoice"("branchId", "reportNumber");

-- 3. A bill thêm tay now takes the number of its first e-invoice
--    (ReportCounter), which may repeat a billSeq that older ones took from
--    BillCounter on the same day.
DROP INDEX "ManualBill_branchId_businessDate_billSeq_key";
CREATE INDEX "ManualBill_branchId_businessDate_idx" ON "ManualBill"("branchId", "businessDate");
