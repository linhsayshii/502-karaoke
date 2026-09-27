import { Separator } from "@/components/ui/separator";
import { billedHoursOf } from "@/lib/billing";
import { formatDuration, formatMoney, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

interface BillAmounts {
  durationMinutes: number;
  hourlyFee: number;
  totalProductPrice: number;
  discountAmount: number;
  hourlyDiscountAmount: number;
  taxAmount: number;
  finalAmount: number;
}

interface BillPercents {
  discountPercent: number;
  hourlyDiscountPercent: number;
  taxPercent: number;
}

function Line({ label, value, muted }: { label: React.ReactNode; value: number; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={cn("min-w-0", muted && "text-muted-foreground")}>{label}</dt>
      <dd className="shrink-0 tabular-nums">{formatMoney(value)}</dd>
    </div>
  );
}

const pct = (value: number) => (value > 0 ? ` (${value}%)` : "");

// The make-up of a bill, as billing.ts computes it. Adjustments that are 0
// are left out.
export function BillSummary({
  bill,
  percents,
  pricePerHour,
  totalLabel = "Khách cần trả",
  className,
}: {
  bill: BillAmounts;
  percents?: BillPercents;
  pricePerHour?: number;
  totalLabel?: string;
  className?: string;
}) {
  return (
    <dl className={cn("flex flex-col gap-2 text-sm", className)}>
      <Line
        label={
          <>
            Tiền giờ{" "}
            <span className="text-muted-foreground">
              ({formatDuration(bill.durationMinutes)}
              {pricePerHour
                ? ` = ${formatNumber(billedHoursOf(bill.durationMinutes))} giờ × ${formatNumber(pricePerHour)}/giờ`
                : ""}
              )
            </span>
          </>
        }
        value={bill.hourlyFee}
      />
      <Line label="Tiền món" value={bill.totalProductPrice} />
      {bill.discountAmount > 0 && (
        <Line muted label={`Giảm giá món${pct(percents?.discountPercent ?? 0)}`} value={-bill.discountAmount} />
      )}
      {bill.hourlyDiscountAmount > 0 && (
        <Line
          muted
          label={`Giảm giá giờ${pct(percents?.hourlyDiscountPercent ?? 0)}`}
          value={-bill.hourlyDiscountAmount}
        />
      )}
      {bill.taxAmount > 0 && <Line muted label={`Thuế VAT${pct(percents?.taxPercent ?? 0)}`} value={bill.taxAmount} />}
      <Separator className="my-1" />
      <div className="flex items-baseline justify-between gap-4">
        <dt className="font-medium">{totalLabel}</dt>
        <dd className="text-2xl font-semibold tracking-tight tabular-nums">{formatMoney(bill.finalAmount)}</dd>
      </div>
    </dl>
  );
}
