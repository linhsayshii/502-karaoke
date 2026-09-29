import { DiscountRequestStatus } from '@prisma/client';

// HH:mm in server local time (TZ=Asia/Ho_Chi_Minh).
const clock = (d: Date) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

// What the second manager to press Duyệt/Từ chối is told: the request was
// already handled, by whom and when.
export function decidedMessage(r: {
  status: DiscountRequestStatus;
  decidedAt: Date | null;
  decidedBy: { fullName: string } | null;
}) {
  const by = r.decidedBy?.fullName ?? 'người khác';
  const at = r.decidedAt ? ` lúc ${clock(r.decidedAt)}` : '';
  switch (r.status) {
    case DiscountRequestStatus.APPROVED:
      return `Yêu cầu đã được ${by} duyệt${at}`;
    case DiscountRequestStatus.REJECTED:
      return `Yêu cầu đã bị ${by} từ chối${at}`;
    case DiscountRequestStatus.CANCELLED:
      return `Yêu cầu đã được ${by} hủy${at}`;
    default:
      return 'Yêu cầu đã hết hạn (phiên đã đóng hoặc giảm giá đã đổi)';
  }
}
