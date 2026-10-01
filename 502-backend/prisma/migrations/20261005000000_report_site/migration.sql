-- Trang báo cáo theo hóa đơn điện tử (spec 2026-10-02-trang-bao-cao-hddt §4.5).

-- 1. Vào trang báo cáo.
ALTER TABLE "User" ADD COLUMN "reportAccess" BOOLEAN NOT NULL DEFAULT false;

-- 2. Bills thêm tay.
CREATE TABLE "ManualBill" (
    "id" SERIAL NOT NULL,
    "branchId" INTEGER NOT NULL,
    "businessDate" DATE NOT NULL,
    "billSeq" INTEGER NOT NULL,
    "billNumber" TEXT NOT NULL,
    "roomId" INTEGER,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" INTEGER,
    "cancelReason" TEXT,

    CONSTRAINT "ManualBill_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ManualBill_branchId_billNumber_idx" ON "ManualBill"("branchId", "billNumber");
CREATE UNIQUE INDEX "ManualBill_branchId_businessDate_billSeq_key" ON "ManualBill"("branchId", "businessDate", "billSeq");

ALTER TABLE "ManualBill" ADD CONSTRAINT "ManualBill_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManualBill" ADD CONSTRAINT "ManualBill_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManualBill" ADD CONSTRAINT "ManualBill_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ManualBill" ADD CONSTRAINT "ManualBill_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 3. The bill of an e-invoice may be a bill thêm tay.
ALTER TABLE "Einvoice" ADD COLUMN "manualBillId" INTEGER;
CREATE INDEX "Einvoice_manualBillId_idx" ON "Einvoice"("manualBillId");
ALTER TABLE "Einvoice" ADD CONSTRAINT "Einvoice_manualBillId_fkey" FOREIGN KEY ("manualBillId") REFERENCES "ManualBill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 4. Every free invoice (no bill) becomes the one invoice of a bill thêm tay
--    without a room (room code 0000), on its business day, numbered after
--    the bills of that day through the same BillCounter as checkout
--    (orders/bill-number.ts: DDMM + room + sequence of 3 digits or more).
DO $$
DECLARE
  inv RECORD;
  seq INTEGER;
  bill INTEGER;
BEGIN
  FOR inv IN
    SELECT "id", "branchId", "businessDate", "createdById", "createdAt"
    FROM "Einvoice" WHERE "orderId" IS NULL ORDER BY "id"
  LOOP
    INSERT INTO "BillCounter" ("branchId", "businessDate", "lastSeq")
    VALUES (inv."branchId", inv."businessDate", 1)
    ON CONFLICT ("branchId", "businessDate")
    DO UPDATE SET "lastSeq" = "BillCounter"."lastSeq" + 1
    RETURNING "lastSeq" INTO seq;
    INSERT INTO "ManualBill" ("branchId", "businessDate", "billSeq", "billNumber", "createdById", "createdAt")
    VALUES (
      inv."branchId", inv."businessDate", seq,
      to_char(inv."businessDate", 'DDMM') || '0000' || lpad(seq::text, GREATEST(3, length(seq::text)), '0'),
      inv."createdById", inv."createdAt")
    RETURNING "id" INTO bill;
    UPDATE "Einvoice" SET "manualBillId" = bill WHERE "id" = inv."id";
  END LOOP;
END $$;

-- 5. An e-invoice belongs to exactly one bill.
ALTER TABLE "Einvoice" ADD CONSTRAINT "Einvoice_one_bill" CHECK (("orderId" IS NULL) <> ("manualBillId" IS NULL));

-- 6. A draft without lines counts its whole amount at 10% VAT, as the filler
--    line would (einvoice-draft.ts draftVatOf); a draft with lines gets it
--    when next saved.
UPDATE "Einvoice" SET "vatAmount" = "amount" - round("amount" / 1.1)
WHERE "status" = 'DRAFT' AND ("draft" IS NULL OR jsonb_array_length("draft"->'lines') = 0);
