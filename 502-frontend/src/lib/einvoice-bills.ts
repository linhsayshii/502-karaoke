import type { EinvoiceBillDetail, EinvoiceDetail, ManualBillDetail } from "@/lib/types";

// A bill of the e-invoice page (spec 2026-10-02-trang-bao-cao-hddt §7.5): a
// paid bill, or a bill thêm tay of the report site.
export interface BillRef {
  kind: "order" | "manual";
  id: number;
}

// What the panel reads of an open bill.
export type BillDetail = EinvoiceBillDetail | ManualBillDetail;

export const sameBill = (a: BillRef | null, b: BillRef | null) =>
  !!a && !!b && a.kind === b.kind && a.id === b.id;

export const billKey = (bill: BillRef) => `${bill.kind}:${bill.id}`;

// The bill an invoice belongs to: every invoice has exactly one.
export function billRefOf(einvoice: Pick<EinvoiceDetail, "orderId" | "manualBillId">): BillRef {
  return einvoice.orderId !== null
    ? { kind: "order", id: einvoice.orderId }
    : { kind: "manual", id: einvoice.manualBillId as number };
}

// What a new draft of the bill is posted with.
export const billBody = (bill: BillRef) =>
  bill.kind === "order" ? { orderId: bill.id } : { manualBillId: bill.id };

// Where the bill is read with its invoices.
export const billUrl = (bill: BillRef) =>
  bill.kind === "order" ? `/einvoices/bill/${bill.id}` : `/report-site/manual-bills/${bill.id}`;

// The bill an answer belongs to.
export const detailRef = (detail: BillDetail): BillRef =>
  "order" in detail ? { kind: "order", id: detail.order.id } : { kind: "manual", id: detail.bill.id };
