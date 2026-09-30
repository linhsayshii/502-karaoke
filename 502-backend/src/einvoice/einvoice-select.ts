import { Prisma } from '@prisma/client';
import { fromDbDate } from '../common/dates';
import { staffRef } from '../orders/order-include';

// Only what the list shows: it returns up to 500 invoices.
export const einvoiceListSelect = {
  id: true,
  branchId: true,
  orderId: true,
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
