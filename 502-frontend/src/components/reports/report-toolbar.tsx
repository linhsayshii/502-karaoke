"use client";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAuth } from "@/components/auth-provider";
import { DateRangePicker } from "@/components/date-range-picker";
import { ExportExcelButton } from "@/components/export-excel-button";
import type { ReportFilters } from "@/hooks/use-report-filters";
import { GROUP_BY_LABELS } from "@/lib/labels";
import { can } from "@/lib/permissions";
import { GROUP_BYS } from "@/lib/reports";
import type { GroupBy } from "@/lib/types";

// Filters shared by the reports: period, grouping, comparison, scope and
// the Excel export. `onExport` undefined disables the export (no data yet).
export function ReportToolbar({
  filters,
  onChange,
  onExport,
  periods = true,
  compare = true,
  scope = true,
}: {
  filters: ReportFilters;
  onChange: (patch: Partial<ReportFilters>) => void;
  onExport?: () => Promise<void>;
  // false for the reports that are not a time series: no grouping, no comparison.
  periods?: boolean;
  // false for a time series without a comparison (Lãi lỗ).
  compare?: boolean;
  // false where the scope is fixed (So sánh cơ sở is always the whole chain).
  scope?: boolean;
}) {
  const { user } = useAuth();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <DateRangePicker value={{ from: filters.from, to: filters.to }} onChange={(range) => onChange(range)} />
      {periods && (
        <>
          <Select value={filters.groupBy} onValueChange={(value) => onChange({ groupBy: value as GroupBy })}>
            <SelectTrigger className="w-28" aria-label="Gộp theo">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GROUP_BYS.map((groupBy) => (
                <SelectItem key={groupBy} value={groupBy}>
                  {GROUP_BY_LABELS[groupBy]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {compare && (
            <Label className="flex items-center gap-2 px-1 text-sm font-normal">
              <Switch checked={filters.compare} onCheckedChange={(compare) => onChange({ compare })} />
              So kỳ trước
            </Label>
          )}
        </>
      )}
      {scope && can(user, "reports.chain") && (
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={filters.chain ? "chain" : "branch"}
          onValueChange={(value) => value && onChange({ chain: value === "chain" })}
          aria-label="Phạm vi"
        >
          <ToggleGroupItem value="branch">Cơ sở này</ToggleGroupItem>
          <ToggleGroupItem value="chain">Toàn chuỗi</ToggleGroupItem>
        </ToggleGroup>
      )}
      <ExportExcelButton className="@xl/main:ml-auto" onExport={onExport} />
    </div>
  );
}
