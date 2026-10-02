import { TrendingDownIcon, TrendingUpIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const percent = new Intl.NumberFormat("vi-VN", { style: "percent", maximumFractionDigits: 1 });

// Change against the previous period; "—" when there is nothing to compare.
export function DeltaBadge({ value }: { value: number | null }) {
  if (value === null) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        —
      </Badge>
    );
  }
  const up = value >= 0;
  const Icon = up ? TrendingUpIcon : TrendingDownIcon;
  return (
    <Badge variant="outline" className={cn("tabular-nums", up ? "text-success" : "text-destructive")}>
      <Icon />
      {up && "+"}
      {percent.format(value)}
    </Badge>
  );
}

// A total at the top of a report. `delta` undefined: not comparing.
export function StatTile({
  label,
  value,
  footer,
  delta,
}: {
  label: string;
  value: string;
  footer?: React.ReactNode;
  delta?: number | null;
}) {
  return (
    <Card className="@container/card gap-2">
      {/* The badge sits beside the label and the value, and drops under them when they do
          not fit side by side (a 10-digit total in a tile of a two-column grid), instead of
          overflowing the card and, in the right column, the page. The text block keeps its
          default min-width (its content) on purpose: that is what makes the badge wrap.
          The big font starts at 320px: 22.500.000.000 ₫ (a month of the whole chain)
          needs 310px at 30px. */}
      <CardHeader className="flex flex-wrap items-start gap-2">
        <div className="flex flex-1 basis-0 flex-col gap-2">
          <CardDescription>{label}</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[320px]/card:text-3xl">{value}</CardTitle>
        </div>
        {delta !== undefined && <DeltaBadge value={delta} />}
      </CardHeader>
      {footer && <CardFooter className="text-sm text-muted-foreground">{footer}</CardFooter>}
    </Card>
  );
}
