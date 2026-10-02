import { TrendingDownIcon, TrendingUpIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const percent = new Intl.NumberFormat("vi-VN", { style: "percent", maximumFractionDigits: 1 });

// Card width from which the big font (30px) fits a value of 12, 13, … 17 characters: its width at 30px
// (198, 218, 237, 245, 265, 284px, tabular figures) plus the header's 48px padding, rounded down to 10.
// Up to 12 characters it is the flat 250px the tile always had, so whatever fits looks exactly as before;
// a longer amount keeps the 24px font in a narrower card instead of overflowing it.
const BIG_FONT_FROM = [
  "@[250px]/card:text-3xl",
  "@[260px]/card:text-3xl",
  "@[280px]/card:text-3xl",
  "@[290px]/card:text-3xl",
  "@[310px]/card:text-3xl",
  "@[330px]/card:text-3xl",
];
const bigFont = (value: string) => BIG_FONT_FROM[Math.min(Math.max(value.length - 12, 0), BIG_FONT_FROM.length - 1)];

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
      {/* The badge sits beside the label and the value, and drops under them when they do not fit
          side by side (a 10-digit total in a tile of a two-column grid), instead of overflowing the
          card and, in the right column, the page. The text block keeps its default min-width (its
          content) on purpose: that is what makes the badge wrap. */}
      <CardHeader className="flex flex-wrap items-start gap-2">
        <div className="flex flex-1 basis-0 flex-col gap-2">
          <CardDescription>{label}</CardDescription>
          <CardTitle className={cn("text-2xl font-semibold tabular-nums", bigFont(value))}>{value}</CardTitle>
        </div>
        {delta !== undefined && <DeltaBadge value={delta} />}
      </CardHeader>
      {footer && <CardFooter className="text-sm text-muted-foreground">{footer}</CardFooter>}
    </Card>
  );
}
