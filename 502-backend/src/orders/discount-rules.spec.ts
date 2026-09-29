import { changedKeys, needsApproval, pickAdjustments } from './discount-rules';

const base = {
  discountPercent: 0,
  discountAmount: 0,
  hourlyDiscountPercent: 0,
  hourlyDiscountAmount: 0,
  taxPercent: 10,
};

describe('needsApproval', () => {
  it('is false when nothing changes', () => {
    expect(needsApproval(base, { ...base })).toBe(false);
  });
  it.each([
    'discountPercent',
    'discountAmount',
    'hourlyDiscountPercent',
    'hourlyDiscountAmount',
  ] as const)('is true when %s goes up', (key) => {
    expect(needsApproval(base, { ...base, [key]: 5 })).toBe(true);
  });
  it('is true when VAT goes down', () => {
    expect(needsApproval(base, { ...base, taxPercent: 8 })).toBe(true);
  });
  it('is false when VAT goes up or a discount is removed', () => {
    expect(needsApproval(base, { ...base, taxPercent: 12 })).toBe(false);
    expect(needsApproval({ ...base, discountPercent: 10 }, base)).toBe(false);
  });
  it('is true when a percent becomes a fixed amount', () => {
    expect(
      needsApproval(
        { ...base, discountPercent: 10 },
        { ...base, discountPercent: 0, discountAmount: 50000 },
      ),
    ).toBe(true);
  });
});

describe('changedKeys / pickAdjustments', () => {
  it('lists the keys that differ', () => {
    expect(
      changedKeys(base, { ...base, taxPercent: 8, discountAmount: 1 }),
    ).toEqual(['discountAmount', 'taxPercent']);
  });
  it('drops undefined and unrelated fields', () => {
    expect(
      pickAdjustments({
        discountPercent: 5,
        taxPercent: undefined,
        cskhId: 3,
      } as never),
    ).toEqual({ discountPercent: 5 });
  });
});
