import { lineAmountOf, lineVatOf } from '../einvoice-math';
import type { EinvoiceLine, SellerProfile } from '../einvoice-types';
import { numberToVietnameseCurrency } from './vietnamese-words';

// Payload field that carries our K502-<id> reference so an invoice whose
// send had no answer can be found again. Confirmed on the real Minvoice
// (01/10/2026): it stores orderNumber, its invoice list filters by it and
// its rows show it (see MARKER_SEARCH_CONFIRMED for what that does not
// decide).
export const MARKER_FIELD: string | null = 'orderNumber';

export interface PayloadInput {
  taxCode: string;
  symbolCode: string;
  registerInvoiceId: string;
  currencyId: string;
  seller: SellerProfile;
  invoiceDate: string;
  buyer: {
    taxCode: string | null;
    name: string | null;
    address: string | null;
    email: string | null;
  };
  lines: EinvoiceLine[];
  marker: string;
}

// Fields the Minvoice web app sends as null on a new invoice.
const NULL_FIELDS = {
  invoiceNumber: null,
  orderNumber: null,
  invoiceListNumber: null,
  invoiceListDate: null,
  securityNo: null,
  fieldName7: null,
  fieldName5: null,
  relatedInvoiceProperty: null,
  relatedInvoiceType: null,
  relatedInvoiceListDate: null,
  relatedInvoiceDate: null,
  relatedInvoiceListNumber: null,
  relatedInvoiceSerial: null,
  relatedInvoiceNumber: null,
  relatedTemplateCode: null,
  invoiceNote: null,
  invoiceListId: null,
  invoiceStatus: null,
};

const orNull = (value: string | null | undefined) => (value ? value : null);

// POST /api/api/app/invoice body, the shape the Minvoice web app sends
// (spec 2026-10-01 §6.2). paymentMethod is always TM/CK.
export function buildMinvoicePayload(
  input: PayloadInput,
): Record<string, unknown> {
  const invoiceDetail = input.lines.map((line, index) => {
    const amount = lineAmountOf(line);
    const vatAmount = lineVatOf(line);
    return {
      formulaType: 'TX',
      orders: index + 1,
      isShowOrder: true,
      ordinalNumber: String(index + 1),
      productCode: '',
      productName: line.name,
      unitCode: line.unit,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      amount,
      discountRate: null,
      discountAmount: 0,
      amountWithoutVAT: amount,
      vatCode: String(line.vatRate),
      vatAmount,
      totalAmount: amount + vatAmount,
      property: 1,
    };
  });
  const amount = invoiceDetail.reduce((sum, line) => sum + line.amount, 0);
  const vatAmount = invoiceDetail.reduce(
    (sum, line) => sum + line.vatAmount,
    0,
  );
  const totalAmount = amount + vatAmount;
  const { seller, buyer } = input;

  return {
    invoiceDetail,
    invoiceSerial: input.symbolCode,
    invoiceDate: input.invoiceDate,
    ...NULL_FIELDS,
    ...(MARKER_FIELD ? { [MARKER_FIELD]: input.marker } : {}),
    currencyCode: 'VND',
    exchangeRate: '1',
    paymentMethod: 'TM/CK',
    sellerTaxCode: input.taxCode,
    sellerLegalName: seller.legalName,
    sellerAddress: seller.address,
    sellerEmail: orNull(seller.email),
    sellerTel: orNull(seller.tel),
    sellBankAccount: orNull(seller.bankAccount),
    sellerBankName: orNull(seller.bankName),
    sellerFax: orNull(seller.fax),
    sellerWebsite: orNull(seller.website),
    buyerTaxCode: orNull(buyer.taxCode),
    buyerCode: null,
    buyerLegalName: orNull(buyer.name),
    buyerAddress: orNull(buyer.address),
    buyerDisplayName: null,
    buyerEmail: orNull(buyer.email),
    buyerTel: null,
    buyerIdentityCard: null,
    buyerBankAccount: null,
    buyerBankName: null,
    passportNumber: null,
    buyerBudgetUnitCode: null,
    amount,
    totalDiscountAmount: 0,
    totalAmountWithoutVAT: amount,
    vatAmount,
    totalAmount,
    totalAmountToWord: numberToVietnameseCurrency(totalAmount),
    relatedInvoiceIds: [],
    registerInvoiceId: input.registerInvoiceId,
    currencyId: input.currencyId,
  };
}
