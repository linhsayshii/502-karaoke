import { billLines, HOURLY_LINE_NAME } from './bill-lines';

const item = (name: string, price: number, quantity = 1) => ({
  name,
  unit: 'Lon',
  quantity,
  price,
});

describe('billLines', () => {
  it('puts the hours first, then the items in the order of the bill', () => {
    expect(
      billLines({
        minutes: 83,
        hourlyFee: 207000,
        pricePerHour: 150000,
        items: [item('Bia', 25000, 4), item('Trái cây', 120000)],
      }),
    ).toEqual([
      {
        name: HOURLY_LINE_NAME,
        unit: 'Giờ',
        quantity: 1.38,
        unitPrice: 150000,
        vatRate: 10,
      },
      { name: 'Bia', unit: 'Lon', quantity: 4, unitPrice: 25000, vatRate: 10 },
      {
        name: 'Trái cây',
        unit: 'Lon',
        quantity: 1,
        unitPrice: 120000,
        vatRate: 10,
      },
    ]);
  });

  it('has no hours line when no room fee was charged', () => {
    const lines = billLines({
      minutes: 30,
      hourlyFee: 0,
      pricePerHour: 150000,
      items: [item('Bia', 25000)],
    });
    expect(lines.map((line) => line.name)).toEqual(['Bia']);
  });

  it('rounds prices to the đồng and keeps at most 50 lines', () => {
    const lines = billLines({
      minutes: 60,
      hourlyFee: 100000,
      pricePerHour: 100000,
      items: Array.from({ length: 60 }, (_, i) => item(`Món ${i}`, 12345.6)),
    });
    expect(lines).toHaveLength(50);
    expect(lines[1].unitPrice).toBe(12346);
    expect(lines[49].name).toBe('Món 48');
  });
});
