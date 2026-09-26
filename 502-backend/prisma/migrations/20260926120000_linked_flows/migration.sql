-- Linked flows: sales, stock and fund stay consistent.
-- * Order.pricePerHour snapshots the room price when a session opens.
-- * Payment method on bills and fund entries (cash / transfer).
-- * Checkout writes a fund receipt (FundTransaction.orderId), an import paid
--   from the fund writes a payment (FundTransaction.stockDocumentId).
-- * Bills, stock documents and fund entries can be cancelled; stock is put
--   back with REVERSAL movements and cancelled entries leave every total.
-- Generated with `prisma migrate diff`, plus the backfills at the end.

BEGIN;

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'TRANSFER');

-- AlterEnum
ALTER TYPE "StockMovementType" ADD VALUE 'REVERSAL';

-- AlterTable
ALTER TABLE "FundTransaction" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledById" INTEGER,
ADD COLUMN     "method" "PaymentMethod" NOT NULL DEFAULT 'CASH',
ADD COLUMN     "orderId" INTEGER,
ADD COLUMN     "stockDocumentId" INTEGER;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledById" INTEGER,
ADD COLUMN     "paymentMethod" "PaymentMethod",
ADD COLUMN     "pricePerHour" DECIMAL(65,30) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "StockDocument" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledById" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "FundTransaction_orderId_key" ON "FundTransaction"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "FundTransaction_stockDocumentId_key" ON "FundTransaction"("stockDocumentId");

-- CreateIndex
CREATE INDEX "Order_branchId_endTime_idx" ON "Order"("branchId", "endTime");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockDocument" ADD CONSTRAINT "StockDocument_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundTransaction" ADD CONSTRAINT "FundTransaction_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundTransaction" ADD CONSTRAINT "FundTransaction_stockDocumentId_fkey" FOREIGN KEY ("stockDocumentId") REFERENCES "StockDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundTransaction" ADD CONSTRAINT "FundTransaction_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------- backfill
-- Sessions opened before this change take the room's current price.
UPDATE "Order" o SET "pricePerHour" = r."pricePerHour"
FROM "Room" r WHERE r."id" = o."roomId";

-- Sessions cancelled before this change: the cancel time was stored in endTime.
UPDATE "Order" SET "cancelledAt" = COALESCE("endTime", "updatedAt")
WHERE "status" = 'CANCELLED' AND "cancelledAt" IS NULL;

COMMIT;
