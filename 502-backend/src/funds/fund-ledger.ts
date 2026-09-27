import { PaymentMethod, Prisma, TransactionType } from '@prisma/client';

// Fund entries written by other modules inside their own transaction, so a
// bill or a stock document and its money always change together.

export const SALES_CATEGORY = 'Bán hàng';
export const PURCHASE_CATEGORY = 'Nhập hàng';

type Tx = Prisma.TransactionClient;

// Phiếu thu of a paid bill.
export function recordSaleReceipt(
  tx: Tx,
  entry: {
    branchId: number;
    orderId: number;
    billNumber: string;
    amount: number;
    method: PaymentMethod;
    occurredAt: Date;
    roomName?: string | null;
    createdById: number;
  },
) {
  return tx.fundTransaction.create({
    data: {
      branchId: entry.branchId,
      type: TransactionType.INCOME,
      method: entry.method,
      amount: entry.amount,
      category: SALES_CATEGORY,
      description: `Thu tiền hóa đơn ${entry.billNumber}${
        entry.roomName ? ` – phòng ${entry.roomName}` : ''
      }`,
      occurredAt: entry.occurredAt,
      orderId: entry.orderId,
      createdById: entry.createdById,
    },
  });
}

// A corrected paid bill: its receipt takes the new total, method and payment
// time. A missing receipt is written only with `createIfMissing` (the bill
// had nothing to collect before); bills paid before receipts existed stay
// out of the fund, as they were.
export async function syncSaleReceipt(
  tx: Tx,
  entry: Parameters<typeof recordSaleReceipt>[1],
  createIfMissing: boolean,
) {
  const receipt = await tx.fundTransaction.findUnique({
    where: { orderId: entry.orderId },
  });
  if (!receipt) {
    return createIfMissing && entry.amount > 0
      ? recordSaleReceipt(tx, entry)
      : null;
  }
  return tx.fundTransaction.update({
    where: { id: receipt.id },
    data: {
      amount: entry.amount,
      method: entry.method,
      occurredAt: entry.occurredAt,
    },
  });
}

// Phiếu chi of an import paid from the fund.
export function recordPurchasePayment(
  tx: Tx,
  entry: {
    branchId: number;
    stockDocumentId: number;
    code: string;
    supplier?: string | null;
    amount: number;
    method: PaymentMethod;
    occurredAt: Date;
    createdById: number;
  },
) {
  return tx.fundTransaction.create({
    data: {
      branchId: entry.branchId,
      type: TransactionType.EXPENSE,
      method: entry.method,
      amount: entry.amount,
      category: PURCHASE_CATEGORY,
      description: `Chi nhập hàng ${entry.code}${
        entry.supplier ? ` – ${entry.supplier}` : ''
      }`,
      occurredAt: entry.occurredAt,
      stockDocumentId: entry.stockDocumentId,
      createdById: entry.createdById,
    },
  });
}

// Cancels the entry linked to a voided bill or cancelled stock document.
export function cancelLinkedEntry(
  tx: Tx,
  link: { orderId: number } | { stockDocumentId: number },
  cancel: { cancelledById: number; reason: string },
) {
  return tx.fundTransaction.updateMany({
    where: { ...link, cancelledAt: null },
    data: {
      cancelledAt: new Date(),
      cancelledById: cancel.cancelledById,
      cancelReason: cancel.reason,
    },
  });
}
