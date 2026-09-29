-- AlterTable
ALTER TABLE "User" ADD COLUMN     "managesPr" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "PrStaff" (
    "id" SERIAL NOT NULL,
    "branchId" INTEGER NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "note" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrStaff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrAttendance" (
    "id" SERIAL NOT NULL,
    "branchId" INTEGER NOT NULL,
    "prStaffId" INTEGER NOT NULL,
    "businessDate" DATE NOT NULL,
    "checkInAt" TIMESTAMP(3) NOT NULL,
    "checkOutAt" TIMESTAMP(3),
    "note" TEXT,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PrStaff_branchId_idx" ON "PrStaff"("branchId");

-- CreateIndex
CREATE INDEX "PrAttendance_branchId_businessDate_idx" ON "PrAttendance"("branchId", "businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "PrAttendance_prStaffId_businessDate_key" ON "PrAttendance"("prStaffId", "businessDate");

-- AddForeignKey
ALTER TABLE "PrStaff" ADD CONSTRAINT "PrStaff_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrAttendance" ADD CONSTRAINT "PrAttendance_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrAttendance" ADD CONSTRAINT "PrAttendance_prStaffId_fkey" FOREIGN KEY ("prStaffId") REFERENCES "PrStaff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrAttendance" ADD CONSTRAINT "PrAttendance_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

