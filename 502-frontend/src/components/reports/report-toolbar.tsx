"use client";

import { useState } from "react";
import { DownloadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAuth } from "@/components/auth-provider";
import { DateRangePicker } from "@/components/date-range-picker";
import type { ReportFilters } from "@/hooks/use-report-filters";
import { useNotify } from "@/hooks/use-notify";
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
}: {
  filters: ReportFilters;
  onChange: (patch: Partial<ReportFilters>) => void;
  onExport?: () => Promise<void>;
}) {
  const { user } = useAuth();
  const notify = useNotify();
  const [exporting, setExporting] = useState(false);

  const runExport = async () => {
    if (!onExport) return;
    setExporting(true);
    try {
      await onExport();
    } catch (error) {
      notify.error(error, "Không thể xuất file Excel");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <DateRangePicker value={{ from: filters.from, to: filters.to }} onChange={(range) => onChange(range)} />
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
      <Label className="flex items-center gap-2 px-1 text-sm font-normal">
        <Switch checked={filters.compare} onCheckedChange={(compare) => onChange({ compare })} />
        So kỳ trước
      </Label>
      {can(user, "reports.chain") && (
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
      <Button variant="outline" className="@xl/main:ml-auto" onClick={runExport} disabled={!onExport || exporting}>
        <DownloadIcon data-icon="inline-start" />
        Xuất Excel
      </Button>
    </div>
  );
}
