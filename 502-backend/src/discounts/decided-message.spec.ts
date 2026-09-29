import { DiscountRequestStatus } from '@prisma/client';
import { decidedMessage } from './decided-message';

const at = new Date(2026, 8, 30, 21, 5); // local 21:05
const by = { fullName: 'Nguyễn A' };

describe('decidedMessage', () => {
  it('names who decided and when', () => {
    expect(
      decidedMessage({
        status: DiscountRequestStatus.APPROVED,
        decidedAt: at,
        decidedBy: by,
      }),
    ).toBe('Yêu cầu đã được Nguyễn A duyệt lúc 21:05');
    expect(
      decidedMessage({
        status: DiscountRequestStatus.REJECTED,
        decidedAt: at,
        decidedBy: by,
      }),
    ).toBe('Yêu cầu đã bị Nguyễn A từ chối lúc 21:05');
    expect(
      decidedMessage({
        status: DiscountRequestStatus.CANCELLED,
        decidedAt: at,
        decidedBy: by,
      }),
    ).toBe('Yêu cầu đã được Nguyễn A hủy lúc 21:05');
  });
  it('says an expired request expired', () => {
    expect(
      decidedMessage({
        status: DiscountRequestStatus.EXPIRED,
        decidedAt: at,
        decidedBy: null,
      }),
    ).toBe('Yêu cầu đã hết hạn (phiên đã đóng hoặc giảm giá đã đổi)');
  });
});
