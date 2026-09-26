export const formatMoney = (amount: number | string | null | undefined) =>
  new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(
    Number(amount ?? 0),
  );

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

export function firstDayOfMonth(date: Date = new Date()) {
  return toDateInput(new Date(date.getFullYear(), date.getMonth(), 1));
}
