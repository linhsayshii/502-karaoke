-- PR/KTV trong phòng: một dòng mỗi lượt PR vào một phòng đang hát (không tính tiền).
-- CreateTable
CREATE TABLE "PrSession" (
    "id" SERIAL NOT NULL,
    "branchId" INTEGER NOT NULL,
    "orderId" INTEGER NOT NULL,
    "prStaffId" INTEGER NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3),
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PrSession_orderId_idx" ON "PrSession"("orderId");

-- CreateIndex
CREATE INDEX "PrSession_branchId_startAt_idx" ON "PrSession"("branchId", "startAt");

-- CreateIndex
CREATE INDEX "PrSession_prStaffId_endAt_idx" ON "PrSession"("prStaffId", "endAt");

-- AddForeignKey
ALTER TABLE "PrSession" ADD CONSTRAINT "PrSession_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrSession" ADD CONSTRAINT "PrSession_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrSession" ADD CONSTRAINT "PrSession_prStaffId_fkey" FOREIGN KEY ("prStaffId") REFERENCES "PrStaff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrSession" ADD CONSTRAINT "PrSession_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

