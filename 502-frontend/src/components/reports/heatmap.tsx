import { Fragment } from "react";
import { WEEKDAY_LABELS } from "@/lib/labels";
import type { HourCell } from "@/lib/types";
import { cn } from "@/lib/utils";

// Columns start at 06:00, the start of the business day, so a night stays
// in one row.
const HOURS = Array.from({ length: 24 }, (_, i) => (i + 6) % 24);

// Weekday (rows, T2 → CN) × hour (columns) grid; the darker, the higher.
// Plain CSS grid: 24 narrow columns still fit a 360px phone.
export function Heatmap({
  cells,
  value,
  format,
}: {
  cells: HourCell[]; // 168, Monday 00:00 first (as the API returns them)
  value: (cell: HourCell) => number;
  format: (value: number) => string;
}) {
  const max = Math.max(0, ...cells.map(value));
  return (
    <div
      role="img"
      aria-label="Biểu đồ nhiệt theo thứ và giờ bắt đầu"
      className="grid grid-cols-[auto_repeat(24,minmax(0,1fr))] gap-0.5 text-[10px] text-muted-foreground"
    >
      <div />
      {HOURS.map((hour) => (
        <div key={hour} className="text-center tabular-nums">
          {hour % 3 === 0 ? hour : ""}
        </div>
      ))}
      {WEEKDAY_LABELS.map((label, day) => (
        <Fragment key={label}>
          <div className="self-center pr-1.5 leading-none">{label}</div>
          {HOURS.map((hour) => {
            const cell = cells[day * 24 + hour];
            const v = cell ? value(cell) : 0;
            return (
              <div
                key={hour}
                title={`${label} ${hour}:00–${hour}:59 · ${format(v)}`}
                className={cn("aspect-square rounded-[3px]", v === 0 && "bg-muted")}
                style={
                  v > 0
                    ? {
                        backgroundColor: `color-mix(in oklab, var(--chart-1) ${Math.round(20 + (80 * v) / max)}%, transparent)`,
                      }
                    : undefined
                }
              />
            );
          })}
        </Fragment>
      ))}
    </div>
  );
}
