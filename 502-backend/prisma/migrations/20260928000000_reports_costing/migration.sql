-- Cost of goods (weighted average): the cost a bill's lines left stock at,
-- and the valuation of every stock movement. Existing rows keep 0 (no
-- backfill, see DEPLOYMENT.md §6.10).

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "unitCost" DECIMAL(65,30) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "costAfter" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "unitCost" DECIMAL(65,30) NOT NULL DEFAULT 0;
