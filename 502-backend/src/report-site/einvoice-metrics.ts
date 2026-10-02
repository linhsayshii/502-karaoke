// Sums of the e-invoices the report site counts (spec 2026-10-02 §5.1); pure.

export interface EinvoiceSums {
  einvoiceCount: number;
  total: number; // VAT included
  vat: number;
  issued: number; // of the total, issued on Minvoice
}

export interface EinvoiceMetrics extends EinvoiceSums {
  revenue: number; // total − VAT
  pending: number; // total − issued
}

export const emptyEinvoiceSums = (): EinvoiceSums => ({
  einvoiceCount: 0,
  total: 0,
  vat: 0,
  issued: 0,
});

export function addEinvoiceSums(acc: EinvoiceSums, row: EinvoiceSums): void {
  acc.einvoiceCount += row.einvoiceCount;
  acc.total += row.total;
  acc.vat += row.vat;
  acc.issued += row.issued;
}

export function sumEinvoices(rows: EinvoiceSums[]): EinvoiceSums {
  const acc = emptyEinvoiceSums();
  for (const row of rows) addEinvoiceSums(acc, row);
  return acc;
}

// Only the metrics: a SQL row also carries its date, branch or room.
export function toEinvoiceMetrics(sums: EinvoiceSums): EinvoiceMetrics {
  const { einvoiceCount, total, vat, issued } = sums;
  return {
    einvoiceCount,
    total,
    vat,
    issued,
    revenue: total - vat,
    pending: total - issued,
  };
}
