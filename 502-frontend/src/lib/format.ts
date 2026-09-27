export const formatMoney = (amount: number | string | null | undefined) =>
  new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(
    Number(amount ?? 0),
  );

// Avatar initials: first and last word of a name ("Nguyễn Văn An" -> "NA").
export function initials(fullName: string) {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : "";
  return `${first}${last}`.toUpperCase();
}

export const formatNumber = (value: number | string | null | undefined) =>
  Number(value ?? 0).toLocaleString("vi-VN");

export const formatDateTime = (value: string | Date | null | undefined) =>
  value
    ? new Date(value).toLocaleString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "";

export const formatDate = (value: string | Date | null | undefined) =>
  value
    ? new Date(typeof value === "string" && value.length === 10 ? `${value}T00:00:00` : value).toLocaleDateString(
        "vi-VN",
        { day: "2-digit", month: "2-digit", year: "numeric" },
      )
    : "";

// "2 giờ 05 phút" / "45 phút".
export function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} phút`;
  return `${hours} giờ ${String(rest).padStart(2, "0")} phút`;
}

// Minutes started between two moments (as the bill counts them).
export function minutesBetween(start: string | Date, end: Date = new Date()) {
  return Math.max(0, Math.ceil((end.getTime() - new Date(start).getTime()) / 60000));
}

export const formatTime = (value: string | Date | null | undefined) =>
  value
    ? new Date(value).toLocaleTimeString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "--:--";

// YYYY-MM-DD in local time (toISOString would shift to UTC).
export function toDateInput(date: Date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// A business day runs 06:00 → 06:00 next morning (as on the server): before
// 06:00 still belongs to the previous day. Report filters default to it.
export const BUSINESS_DAY_START_HOUR = 6;

function businessDay(date: Date) {
  const day = new Date(date);
  if (day.getHours() < BUSINESS_DAY_START_HOUR) day.setDate(day.getDate() - 1);
  return day;
}

// YYYY-MM-DD of the business day `date` belongs to.
export function businessDate(date: Date = new Date()) {
  return toDateInput(businessDay(date));
}

// First day of the month of the current business day.
export function firstDayOfMonth(date: Date = new Date()) {
  const day = businessDay(date);
  return toDateInput(new Date(day.getFullYear(), day.getMonth(), 1));
}

// Số hóa đơn (DDMM of the business day + room + sequence, e.g. 27093020001);
// an open session has none yet and shows its id.
export function billLabel(order: { id: number; billNumber?: string | null }): string {
  return order.billNumber ?? `#${order.id}`;
}
