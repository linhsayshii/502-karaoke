-- Reports: whole-chain queries by payment time, and the lines of the paid bills.

-- CreateIndex
CREATE INDEX "Order_status_endTime_idx" ON "Order"("status", "endTime");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");
