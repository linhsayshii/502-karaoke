-- Foundation: branches, 4 roles, employees merged into users, per-branch
-- catalog, stock ledger, per-branch cash fund.
-- Hand-written because it migrates legacy rows; the resulting schema matches
-- schema.prisma exactly (checked with `prisma migrate diff`).
-- Wrapped in a transaction (Prisma does not do it on PostgreSQL) so a failure
-- leaves the legacy database untouched.

BEGIN;

-- ---------------------------------------------------------------- enums
CREATE TYPE "StaffPosition" AS ENUM ('CSKH', 'SERVER');
CREATE TYPE "RoomStatus" AS ENUM ('AVAILABLE', 'ACTIVE', 'MAINTENANCE');
CREATE TYPE "StockDocType" AS ENUM ('IMPORT', 'EXPORT');
CREATE TYPE "StockMovementType" AS ENUM ('IMPORT', 'EXPORT', 'SALE', 'ADJUSTMENT');

-- ---------------------------------------------------------------- branches
CREATE TABLE "Branch" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Branch_code_key" ON "Branch"("code");

INSERT INTO "Branch" ("code", "name", "updatedAt") VALUES
    ('cs1', 'Cơ sở 1', CURRENT_TIMESTAMP),
    ('cs2', 'Cơ sở 2', CURRENT_TIMESTAMP),
    ('cs3', 'Cơ sở 3', CURRENT_TIMESTAMP),
    ('cs4', 'Cơ sở 4', CURRENT_TIMESTAMP);

-- Any other branch code already used by rooms/orders becomes a branch too.
INSERT INTO "Branch" ("code", "name", "updatedAt")
SELECT DISTINCT x.code, x.code, CURRENT_TIMESTAMP
FROM (SELECT "branch" AS code FROM "Room" UNION SELECT "branch" FROM "Order") x
WHERE x.code IS NOT NULL AND x.code NOT IN (SELECT "code" FROM "Branch");

-- ---------------------------------------------------------------- rooms
ALTER TABLE "Room" ADD COLUMN "branchId" INTEGER;
UPDATE "Room" r SET "branchId" = b."id" FROM "Branch" b WHERE b."code" = r."branch";
ALTER TABLE "Room" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "Room" DROP COLUMN "branch";

ALTER TABLE "Room" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Room" ALTER COLUMN "status" TYPE "RoomStatus" USING (
    CASE WHEN "status" IN ('AVAILABLE', 'ACTIVE', 'MAINTENANCE') THEN "status" ELSE 'AVAILABLE' END
)::"RoomStatus";
ALTER TABLE "Room" ALTER COLUMN "status" SET DEFAULT 'AVAILABLE';

-- ---------------------------------------------------------------- orders
ALTER TABLE "Order" ADD COLUMN "branchId" INTEGER,
ADD COLUMN "checkedOutById" INTEGER,
ADD COLUMN "createdById" INTEGER;
UPDATE "Order" o SET "branchId" = b."id" FROM "Branch" b WHERE b."code" = o."branch";
ALTER TABLE "Order" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "Order" DROP COLUMN "branch";

-- ---------------------------------------------------------------- users
-- ADMIN -> CHAIN_MANAGER; the old STAFF app accounts did cashier work.
CREATE TYPE "Role_new" AS ENUM ('CHAIN_MANAGER', 'BRANCH_MANAGER', 'CASHIER', 'STAFF');
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role_new" USING (
    CASE "role"::text WHEN 'ADMIN' THEN 'CHAIN_MANAGER' ELSE 'CASHIER' END
)::"Role_new";
ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "Role_old";
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'STAFF';

ALTER TABLE "User" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "branchId" INTEGER,
ADD COLUMN "fullName" TEXT,
ADD COLUMN "phone" TEXT,
ADD COLUMN "position" "StaffPosition",
ADD COLUMN "legacyEmployeeId" INTEGER,
ALTER COLUMN "password" DROP NOT NULL;

UPDATE "User" SET "fullName" = "username";
UPDATE "User" SET "branchId" = (SELECT "id" FROM "Branch" WHERE "code" = 'cs1')
WHERE "role" <> 'CHAIN_MANAGER';

-- Employees become accounts without a password (cannot log in until a
-- manager sets one), in the branch where they served the most orders.
INSERT INTO "User" ("username", "password", "fullName", "phone", "role", "position",
                    "branchId", "active", "createdAt", "updatedAt", "legacyEmployeeId")
SELECT
    CASE WHEN EXISTS (SELECT 1 FROM "User" u WHERE u."username" = 'nv' || e."id")
         THEN 'nv' || e."id" || '_cu' ELSE 'nv' || e."id" END,
    NULL,
    e."name",
    e."phone",
    'STAFF',
    CASE e."role" WHEN 'CSKH' THEN 'CSKH'::"StaffPosition" WHEN 'SERVER' THEN 'SERVER'::"StaffPosition" END,
    COALESCE(
        (SELECT o."branchId" FROM "Order" o
         WHERE o."cskhId" = e."id" OR o."serverId" = e."id"
         GROUP BY o."branchId" ORDER BY count(*) DESC, o."branchId" LIMIT 1),
        (SELECT "id" FROM "Branch" WHERE "code" = 'cs1')
    ),
    true,
    e."createdAt",
    CURRENT_TIMESTAMP,
    e."id"
FROM "Employee" e;

ALTER TABLE "Order" DROP CONSTRAINT "Order_cskhId_fkey";
ALTER TABLE "Order" DROP CONSTRAINT "Order_serverId_fkey";
UPDATE "Order" o SET "cskhId" = u."id" FROM "User" u WHERE u."legacyEmployeeId" = o."cskhId";
UPDATE "Order" o SET "serverId" = u."id" FROM "User" u WHERE u."legacyEmployeeId" = o."serverId";

DROP TABLE "Employee";
ALTER TABLE "User" DROP COLUMN "legacyEmployeeId";
ALTER TABLE "User" ALTER COLUMN "fullName" SET NOT NULL;

-- ---------------------------------------------------------------- catalog
-- The existing (global) catalog stays with cs1, keeping ids and stock. Every
-- other branch gets its own copy with zero stock, and order items of orders
-- in those branches are re-pointed to that branch's copy.
ALTER TABLE "Category" ADD COLUMN "branchId" INTEGER, ADD COLUMN "legacyId" INTEGER;
UPDATE "Category" SET "branchId" = (SELECT "id" FROM "Branch" WHERE "code" = 'cs1');
INSERT INTO "Category" ("name", "branchId", "createdAt", "updatedAt", "legacyId")
SELECT c."name", b."id", c."createdAt", CURRENT_TIMESTAMP, c."id"
FROM "Category" c CROSS JOIN "Branch" b
WHERE b."code" <> 'cs1' AND c."legacyId" IS NULL;
ALTER TABLE "Category" ALTER COLUMN "branchId" SET NOT NULL;

ALTER TABLE "Product" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "branchId" INTEGER,
ADD COLUMN "costPrice" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN "trackStock" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "legacyId" INTEGER;
UPDATE "Product" SET "branchId" = (SELECT "id" FROM "Branch" WHERE "code" = 'cs1');
INSERT INTO "Product" ("name", "branchId", "categoryId", "price", "stockQuantity", "unit",
                       "createdAt", "updatedAt", "legacyId")
SELECT p."name", b."id",
       (SELECT nc."id" FROM "Category" nc WHERE nc."legacyId" = p."categoryId" AND nc."branchId" = b."id"),
       p."price", 0, p."unit", p."createdAt", CURRENT_TIMESTAMP, p."id"
FROM "Product" p CROSS JOIN "Branch" b
WHERE b."code" <> 'cs1' AND p."legacyId" IS NULL;
ALTER TABLE "Product" ALTER COLUMN "branchId" SET NOT NULL;

UPDATE "OrderItem" oi SET "productId" = np."id"
FROM "Order" o, "Product" np
WHERE o."id" = oi."orderId" AND np."legacyId" = oi."productId" AND np."branchId" = o."branchId";

ALTER TABLE "Category" DROP COLUMN "legacyId";
ALTER TABLE "Product" DROP COLUMN "legacyId";

-- ---------------------------------------------------------------- stock
CREATE TABLE "StockDocument" (
    "id" SERIAL NOT NULL,
    "branchId" INTEGER NOT NULL,
    "type" "StockDocType" NOT NULL,
    "code" TEXT NOT NULL,
    "supplier" TEXT,
    "note" TEXT,
    "totalAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StockDocumentLine" (
    "id" SERIAL NOT NULL,
    "documentId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCost" DECIMAL(65,30) NOT NULL DEFAULT 0,
    CONSTRAINT "StockDocumentLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StockMovement" (
    "id" SERIAL NOT NULL,
    "branchId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "documentId" INTEGER,
    "orderId" INTEGER,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- Opening balances, so the ledger always sums to Product.stockQuantity.
INSERT INTO "StockMovement" ("branchId", "productId", "type", "quantity", "balanceAfter")
SELECT "branchId", "id", 'ADJUSTMENT', "stockQuantity", "stockQuantity"
FROM "Product" WHERE "stockQuantity" <> 0;

-- ---------------------------------------------------------------- funds
ALTER TABLE "FundTransaction" ADD COLUMN "branchId" INTEGER,
ADD COLUMN "category" TEXT,
ADD COLUMN "createdById" INTEGER,
ADD COLUMN "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "FundTransaction" SET "branchId" = (SELECT "id" FROM "Branch" WHERE "code" = 'cs1'),
                             "occurredAt" = "createdAt";
ALTER TABLE "FundTransaction" ALTER COLUMN "branchId" SET NOT NULL;

-- ---------------------------------------------------------------- indexes
CREATE UNIQUE INDEX "StockDocument_code_key" ON "StockDocument"("code");
CREATE INDEX "StockDocument_branchId_createdAt_idx" ON "StockDocument"("branchId", "createdAt");
CREATE INDEX "StockMovement_branchId_productId_createdAt_idx" ON "StockMovement"("branchId", "productId", "createdAt");
CREATE INDEX "Category_branchId_idx" ON "Category"("branchId");
CREATE INDEX "FundTransaction_branchId_occurredAt_idx" ON "FundTransaction"("branchId", "occurredAt");
CREATE INDEX "Order_branchId_status_idx" ON "Order"("branchId", "status");
CREATE INDEX "Order_branchId_startTime_idx" ON "Order"("branchId", "startTime");
CREATE INDEX "Product_branchId_idx" ON "Product"("branchId");
CREATE INDEX "Room_branchId_idx" ON "Room"("branchId");
CREATE INDEX "User_branchId_idx" ON "User"("branchId");

-- ---------------------------------------------------------------- foreign keys
ALTER TABLE "OrderItem" DROP CONSTRAINT "OrderItem_orderId_fkey";
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "User" ADD CONSTRAINT "User_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Category" ADD CONSTRAINT "Category_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Product" ADD CONSTRAINT "Product_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Room" ADD CONSTRAINT "Room_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_cskhId_fkey" FOREIGN KEY ("cskhId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_checkedOutById_fkey" FOREIGN KEY ("checkedOutById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StockDocument" ADD CONSTRAINT "StockDocument_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockDocument" ADD CONSTRAINT "StockDocument_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockDocumentLine" ADD CONSTRAINT "StockDocumentLine_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "StockDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockDocumentLine" ADD CONSTRAINT "StockDocumentLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "StockDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FundTransaction" ADD CONSTRAINT "FundTransaction_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FundTransaction" ADD CONSTRAINT "FundTransaction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
