import { TrendingDownIcon, TrendingUpIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
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
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">{value}</CardTitle>
        {delta !== undefined && (
          <CardAction>
            <DeltaBadge value={delta} />
          </CardAction>
        )}
      </CardHeader>
      {footer && <CardFooter className="text-sm text-muted-foreground">{footer}</CardFooter>}
    </Card>
  );
}
