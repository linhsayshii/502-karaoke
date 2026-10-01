import {
  buildMinvoicePayload,
  MARKER_FIELD,
  PayloadInput,
} from './minvoice-payload';

const input: PayloadInput = {
  taxCode: '0107811836',
  symbolCode: '1C26MTT',
  registerInvoiceId: 'range-1',
  currencyId: 'vnd-id',
  seller: {
    legalName: 'CÔNG TY CP THƯƠNG MẠI VÀ DỊCH VỤ PHƯƠNG LÂM',
    address: 'Số nhà 45A đường Hoàng Liệt, Phường Hoàng Liệt, TP Hà Nội',
    email: 'ketoan@example.com',
    tel: '',
    bankAccount: '0123456789',
    bankName: 'Ngân hàng thử',
    fax: '',
    website: '',
  },
  invoiceDate: '2026-10-01',
  buyer: {
    taxCode: '0107068321',
    name: 'CÔNG TY HOÀNG GIA',
    address: 'Số 26, phố Nhổn',
    email: null,
  },
  lines: [
    {
      name: 'Tiền giờ phòng P409',
      unit: 'Giờ',
      quantity: 1.38,
      unitPrice: 300000,
      vatRate: 10,
    },
    {
      name: 'Dịch vụ karaoke',
      unit: 'Lần',
      quantity: 1,
      unitPrice: 909095,
      vatRate: 10,
      vatAmount: 90909,
    },
  ],
  marker: 'K502-7',
};

describe('buildMinvoicePayload', () => {
  const payload = buildMinvoicePayload(input);

  it('always pays TM/CK and pairs the serial with its own range', () => {
    expect(payload.paymentMethod).toBe('TM/CK');
    expect(payload.invoiceSerial).toBe('1C26MTT');
    expect(payload.registerInvoiceId).toBe('range-1');
    expect(payload.currencyId).toBe('vnd-id');
    expect(payload.currencyCode).toBe('VND');
    expect(payload.exchangeRate).toBe('1');
    expect(payload.invoiceDate).toBe('2026-10-01');
  });

  it('maps the lines and adds them up', () => {
    const detail = payload.invoiceDetail as Record<string, unknown>[];
    expect(detail[0]).toMatchObject({
      formulaType: 'TX',
      orders: 1,
      ordinalNumber: '1',
      isShowOrder: true,
      productCode: '',
      productName: 'Tiền giờ phòng P409',
      unitCode: 'Giờ',
      quantity: 1.38,
      unitPrice: 300000,
      amount: 414000,
      discountRate: null,
      discountAmount: 0,
      amountWithoutVAT: 414000,
      vatCode: '10',
      vatAmount: 41400,
      totalAmount: 455400,
      property: 1,
    });
    expect(detail[1]).toMatchObject({
      amount: 909095,
      vatAmount: 90909,
      totalAmount: 1000004,
    });
    expect(payload).toMatchObject({
      amount: 1323095,
      totalAmountWithoutVAT: 1323095,
      totalDiscountAmount: 0,
      vatAmount: 132309,
      totalAmount: 1455404,
      totalAmountToWord:
        'Một triệu bốn trăm năm mươi lăm nghìn bốn trăm linh bốn đồng',
      relatedInvoiceIds: [],
    });
  });

  it('maps seller and buyer, empty values as null', () => {
    expect(payload).toMatchObject({
      sellerTaxCode: '0107811836',
      sellerLegalName: 'CÔNG TY CP THƯƠNG MẠI VÀ DỊCH VỤ PHƯƠNG LÂM',
      sellBankAccount: '0123456789',
      sellerBankName: 'Ngân hàng thử',
      sellerTel: null,
      buyerTaxCode: '0107068321',
      buyerLegalName: 'CÔNG TY HOÀNG GIA',
      buyerAddress: 'Số 26, phố Nhổn',
      buyerEmail: null,
      buyerCode: null,
    });
  });

  it('puts the reference only in the field found by Task 0', () => {
    if (MARKER_FIELD) expect(payload[MARKER_FIELD]).toBe('K502-7');
    else expect(Object.values(payload)).not.toContain('K502-7');
  });
});
