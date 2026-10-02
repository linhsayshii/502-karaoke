// Shapes shared by the e-invoice services (spec 2026-10-01 §4.1).

export const VAT_RATES = [0, 5, 8, 10] as const;
export type VatRate = (typeof VAT_RATES)[number];

export interface EinvoiceLine {
  name: string;
  unit: string;
  quantity: number;
  // Whole đồng, before VAT.
  unitPrice: number;
  vatRate: VatRate;
  // Only on a filler line whose VAT takes the đồng no price can reach (§5).
  vatAmount?: number;
}

// Einvoice.draft: the details of an invoice not issued yet. Once it is issued
// only the buyer's address and email are dropped: the lines stay (`{ lines }`,
// spec 2026-10-02 §4.3), for the report site's products report.
export interface EinvoiceDraft {
  buyerAddress: string | null;
  buyerEmail: string | null;
  lines: EinvoiceLine[];
}

// EinvoiceConfig.seller, from Minvoice's tenant-company.
export interface SellerProfile {
  legalName: string;
  address: string;
  email: string;
  tel: string;
  bankAccount: string;
  bankName: string;
  fax: string;
  website: string;
}

// A branch's MST is part of the Minvoice host name: companies only.
export const BRANCH_TAX_CODE_RE = /^\d{10}(-\d{3})?$/;
// A buyer may also be a person, whose MST is the 12-digit citizen id (07/2025).
export const BUYER_TAX_CODE_RE = /^(\d{10}(-\d{3})?|\d{12})$/;
