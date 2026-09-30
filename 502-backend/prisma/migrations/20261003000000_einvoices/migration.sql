-- Hóa đơn điện tử (spec 2026-10-01): Branch.taxCode, EinvoiceConfig, Einvoice.

-- CreateEnum
CREATE TYPE "EinvoiceStatus" AS ENUM ('DRAFT', 'SENDING', 'UNCERTAIN', 'ISSUED');

-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "taxCode" TEXT;

-- CreateTable
CREATE TABLE "EinvoiceConfig" (
    "id" SERIAL NOT NULL,
    "branchId" INTEGER NOT NULL,
    "taxCode" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordEnc" TEXT NOT NULL,
    "sessionEnc" TEXT,
    "loginError" TEXT,
    "symbolCode" TEXT,
    "registerInvoiceId" TEXT,
    "currencyId" TEXT,
    "seller" JSONB,
    "loggedInAt" TIMESTAMP(3),
    "updatedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EinvoiceConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Einvoice" (
    "id" SERIAL NOT NULL,
    "branchId" INTEGER NOT NULL,
    "orderId" INTEGER NOT NULL,
    "businessDate" DATE NOT NULL,
    "status" "EinvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "amount" DECIMAL(65,30) NOT NULL,
    "vatAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "buyerTaxCode" TEXT,
    "buyerName" TEXT,
    "draft" JSONB,
    "sellerTaxCode" TEXT,
    "symbolCode" TEXT,
    "registerInvoiceId" TEXT,
    "invoiceDate" DATE,
    "invoiceNumber" INTEGER,
    "minvoiceId" TEXT,
    "lastError" TEXT,
    "sendingAt" TIMESTAMP(3),
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedById" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "issuedById" INTEGER,
    "issuedAt" TIMESTAMP(3),
    "numberEditedById" INTEGER,
    "numberEditedAt" TIMESTAMP(3),

    CONSTRAINT "Einvoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EinvoiceConfig_branchId_key" ON "EinvoiceConfig"("branchId");

-- CreateIndex
CREATE INDEX "Einvoice_branchId_businessDate_idx" ON "Einvoice"("branchId", "businessDate");

-- CreateIndex
CREATE INDEX "Einvoice_branchId_status_createdAt_idx" ON "Einvoice"("branchId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Einvoice_orderId_idx" ON "Einvoice"("orderId");

-- CreateIndex
CREATE INDEX "Einvoice_sellerTaxCode_symbolCode_invoiceDate_idx" ON "Einvoice"("sellerTaxCode", "symbolCode", "invoiceDate");

-- CreateIndex
CREATE UNIQUE INDEX "Einvoice_sellerTaxCode_symbolCode_invoiceNumber_key" ON "Einvoice"("sellerTaxCode", "symbolCode", "invoiceNumber");

-- AddForeignKey
ALTER TABLE "EinvoiceConfig" ADD CONSTRAINT "EinvoiceConfig_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EinvoiceConfig" ADD CONSTRAINT "EinvoiceConfig_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Einvoice" ADD CONSTRAINT "Einvoice_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Einvoice" ADD CONSTRAINT "Einvoice_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Einvoice" ADD CONSTRAINT "Einvoice_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Einvoice" ADD CONSTRAINT "Einvoice_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Einvoice" ADD CONSTRAINT "Einvoice_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Einvoice" ADD CONSTRAINT "Einvoice_numberEditedById_fkey" FOREIGN KEY ("numberEditedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

