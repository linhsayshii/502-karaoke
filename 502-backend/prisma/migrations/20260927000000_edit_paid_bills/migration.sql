-- * VAT 10% by default on new room sessions (open sessions keep their value).
-- * New rooms are VIP unless another type is given.
-- * Managers may correct a paid bill; the last correction is recorded.

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "editReason" TEXT,
ADD COLUMN     "editedAt" TIMESTAMP(3),
ADD COLUMN     "editedById" INTEGER,
ALTER COLUMN "taxPercent" SET DEFAULT 10;

-- AlterTable
ALTER TABLE "Room" ALTER COLUMN "type" SET DEFAULT 'VIP';

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
