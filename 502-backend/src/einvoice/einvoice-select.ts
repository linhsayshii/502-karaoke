import { Prisma } from '@prisma/client';
import { fromDbDate } from '../common/dates';
import { staffRef } from '../orders/order-include';

// The fields every invoice row carries; einvoiceDetailSelect (the bill
// panel's) adds the draft to them.
export const einvoiceListSelect = {
  id: true,
  branchId: true,
  orderId: true,
  manualBillId: true,
  status: true,
  amount: true,
  vatAmount: true,
  buyerTaxCode: true,
  buyerName: true,
  symbolCode: true,
  invoiceDate: true,
  invoiceNumber: true,
  lastError: true,
  createdAt: true,
  issuedAt: true,
  createdBy: staffRef,
  issuedBy: staffRef,
  order: {
    select: {
      id: true,
      billNumber: true,
      finalAmount: true,
      endTime: true,
      cancelledAt: true,
      editedAt: true,
      room: { select: { name: true } },
    },
  },
} satisfies Prisma.EinvoiceSelect;

// One invoice as the panel shows it: the list fields plus its draft.
export const einvoiceDetailSelect = {
  ...einvoiceListSelect,
  draft: true,
  sellerTaxCode: true,
  minvoiceId: true,
  // When the last send started: "Chưa có — gửi lại" waits RESEND_WAIT_MS.
  sendingAt: true,
  updatedAt: true,
  updatedBy: staffRef,
  numberEditedAt: true,
  numberEditedBy: staffRef,
} satisfies Prisma.EinvoiceSelect;

// invoiceDate is a @db.Date: sent as YYYY-MM-DD.
export function toEinvoiceRow<T extends { invoiceDate: Date | null }>(row: T) {
  return {
    ...row,
    invoiceDate: row.invoiceDate ? fromDbDate(row.invoiceDate) : null,
  };
}
