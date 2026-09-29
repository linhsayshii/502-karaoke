import { ADJUSTMENT_LABELS, changedKeys } from "@/lib/discount-rules";
import { formatMoney, formatNumber } from "@/lib/format";
import type { DiscountRequestRow } from "@/lib/types";

// "Giảm giá món (%): 0 → 10" per changed field, and the totals.
export function AdjustmentDiff({ request }: { request: DiscountRequestRow }) {
  return (
    <div className="flex flex-col gap-1 text-sm">
      {changedKeys(request.before, request.after).map((k) => (
        <span key={k} className="tabular-nums">
          {ADJUSTMENT_LABELS[k]}: {formatNumber(request.before[k])} → <b>{formatNumber(request.after[k])}</b>
        </span>
      ))}
      <span className="text-muted-foreground tabular-nums">
        Tổng {formatMoney(request.amountBefore)} → {formatMoney(request.amountAfter)}
      </span>
    </div>
  );
}
