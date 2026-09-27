"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { formatCompact } from "@/lib/format";

const ROW_HEIGHT = 32;

// The first `limit` rows (already ranked, highest first) as horizontal bars.
export function RankingChart({
  rows,
  label,
  limit = 10,
}: {
  rows: { name: string; value: number }[];
  label: string;
  limit?: number;
}) {
  const data = rows.filter((row) => row.value > 0).slice(0, limit);
  const config = { value: { label, color: "var(--chart-1)" } } satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height: 40 + data.length * ROW_HEIGHT }}>
      <BarChart data={data} layout="vertical" margin={{ left: 4, right: 16 }}>
        <CartesianGrid horizontal={false} />
        <XAxis
          type="number"
          tickLine={false}
          axisLine={false}
          tickFormatter={(value: number) => formatCompact(value)}
        />
        <YAxis
          type="category"
          dataKey="name"
          tickLine={false}
          axisLine={false}
          width={104}
          tickFormatter={(value: string) => (value.length > 14 ? `${value.slice(0, 13)}…` : value)}
        />
        <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
        <Bar dataKey="value" fill="var(--color-value)" radius={4} maxBarSize={24} />
      </BarChart>
    </ChartContainer>
  );
}
