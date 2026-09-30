import { numberToVietnameseCurrency } from './vietnamese-words';

describe('numberToVietnameseCurrency', () => {
  it.each([
    [0, 'Không đồng'],
    [15, 'Mười lăm đồng'],
    [21, 'Hai mươi mốt đồng'],
    [1005, 'Một nghìn không trăm linh năm đồng'],
    [476800, 'Bốn trăm bảy mươi sáu nghìn tám trăm đồng'],
    [1000000, 'Một triệu đồng'],
    [4332400, 'Bốn triệu ba trăm ba mươi hai nghìn bốn trăm đồng'],
  ])('%d -> %s', (value, words) => {
    expect(numberToVietnameseCurrency(value)).toBe(words);
  });

  it('refuses a negative amount', () => {
    expect(() => numberToVietnameseCurrency(-1)).toThrow();
  });
});
