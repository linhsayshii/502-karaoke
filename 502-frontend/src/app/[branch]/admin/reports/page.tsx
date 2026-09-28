"use client";

import { Suspense, useState } from "react";
import { DownloadIcon, FileSpreadsheetIcon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAuth } from "@/components/auth-provider";
import { DateRangePicker, formatDateRange } from "@/components/date-range-picker";
import { PageHeader } from "@/components/layout/page-header";
import { useNotify } from "@/hooks/use-notify";
import { useReportFilters } from "@/hooks/use-report-filters";
import { useBranchCode } from "@/lib/branch";
import { exportWorkbook } from "@/lib/excel-export";
import { BUSINESS_DAY_HINT, GROUP_BY_LABELS } from "@/lib/labels";
import { can } from "@/lib/permissions";
import { cachedGet, DEFAULT_DOWNLOADS, DOWNLOAD_REPORTS, type DownloadContext } from "@/lib/report-downloads";
import { dayCount, GROUP_BYS, MAX_REPORT_RANGE_DAYS, reportFileName } from "@/lib/reports";
import type { GroupBy } from "@/lib/types";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "report-download:sheets";

// The sheets picked last time on this browser (or the defaults).
function loadSelection(): Set<string> {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return new Set(JSON.parse(saved) as string[]);
  } catch {
    // Storage blocked or unreadable: start from the defaults.
  }
  return new Set(DEFAULT_DOWNLOADS);
}

function saveSelection(selection: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...selection]));
  } catch {
    // Only a convenience.
  }
}

// Several reports over one range in one Excel file, one sheet per report,
// the same sheets as each report page's own export.
function ReportDownloadsView() {
  const branch = useBranchCode();
  const { user, branches } = useAuth();
  const notify = useNotify();
  const { filters, setFilters } = useReportFilters();
  const [selected, setSelected] = useState(loadSelection);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const chainAllowed = can(user, "reports.chain");
  const scopeName = filters.chain
    ? "Toàn chuỗi"
    : (branches.find((b) => b.code === branch)?.name ?? branch.toUpperCase());
  const tooLong = dayCount(filters.from, filters.to) > MAX_REPORT_RANGE_DAYS;

  const reports = DOWNLOAD_REPORTS.filter((report) => !report.permission || can(user, report.permission)).map(
    (report) => ({ ...report, reason: report.unavailable?.(filters) ?? null }),
  );
  // In workbook order; reports that cannot be downloaded now are left out.
  const sheets = reports.flatMap((report) =>
    report.reason ? [] : report.sheets.filter((sheet) => selected.has(sheet.key)),
  );
  const usesPeriods = reports.some((report) => report.periods && report.sheets.some((s) => selected.has(s.key)));
  const downloadable = reports.flatMap((report) => (report.reason ? [] : report.sheets));

  const update = (next: Set<string>) => {
    setSelected(next);
    saveSelection(next);
  };
  const toggle = (key: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(key);
    else next.delete(key);
    update(next);
  };

  const download = async () => {
    if (sheets.length === 0 || tooLong) return;
    const warnings: string[] = [];
    const ctx: DownloadContext = {
      branch,
      chain: filters.chain,
      from: filters.from,
      to: filters.to,
      groupBy: filters.groupBy,
      rangeLabel: formatDateRange(filters),
      get: cachedGet(),
      warn: (message) => warnings.push(message),
    };
    setProgress({ done: 0, total: sheets.length });
    try {
      const tables = await Promise.all(
        sheets.map(async (sheet) => {
          const table = await sheet.build(ctx);
          setProgress((p) => p && { ...p, done: p.done + 1 });
          return table;
        }),
      );
      const scope = filters.chain ? "toan-chuoi" : branch;
      await exportWorkbook(reportFileName("bao-cao", scope, filters.from, filters.to), tables);
      notify.success(`Đã xuất ${tables.length} báo cáo`);
      for (const message of warnings) toast.warning(message);
    } catch (error) {
      notify.error(error, "Không thể tải báo cáo");
    } finally {
      setProgress(null);
    }
  };

  const busy = progress !== null;

  return (
    <>
      <PageHeader
        title="Tải báo cáo"
        description={scopeName}
        info={`Chọn các báo cáo và khoảng ngày rồi xuất một file Excel, mỗi báo cáo là một sheet (giống nút Xuất Excel của từng trang báo cáo). Doanh thu chưa gồm VAT, VAT tính riêng. ${BUSINESS_DAY_HINT}`}
      />

      <div className="grid items-start gap-4 @4xl/main:grid-cols-[minmax(0,1fr)_20rem]">
        <Card className="@4xl/main:sticky @4xl/main:top-[calc(var(--header-height)+1rem)] @4xl/main:order-last">
          <CardHeader>
            <CardTitle>Thiết lập</CardTitle>
            <CardDescription>Áp dụng cho mọi báo cáo được chọn.</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup className="gap-5">
              <Field>
                <FieldLabel>Khoảng ngày</FieldLabel>
                <DateRangePicker
                  value={{ from: filters.from, to: filters.to }}
                  onChange={(range) => setFilters(range)}
                  className="w-full"
                />
                {tooLong && (
                  <FieldDescription className="text-destructive">
                    Tối đa {MAX_REPORT_RANGE_DAYS} ngày.
                  </FieldDescription>
                )}
              </Field>
              <Field data-disabled={!usesPeriods || undefined}>
                <FieldLabel htmlFor="download-group-by">Gộp theo</FieldLabel>
                <Select
                  value={filters.groupBy}
                  onValueChange={(value) => setFilters({ groupBy: value as GroupBy })}
                  disabled={!usesPeriods}
                >
                  <SelectTrigger id="download-group-by" className="w-full">
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
                <FieldDescription>Kỳ của Doanh thu, Lãi lỗ và So sánh cơ sở.</FieldDescription>
              </Field>
              {chainAllowed && (
                <Field>
                  <FieldLabel>Phạm vi</FieldLabel>
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    className="w-full"
                    value={filters.chain ? "chain" : "branch"}
                    onValueChange={(value) => value && setFilters({ chain: value === "chain" })}
                    aria-label="Phạm vi"
                  >
                    <ToggleGroupItem value="branch" className="flex-1">
                      Cơ sở này
                    </ToggleGroupItem>
                    <ToggleGroupItem value="chain" className="flex-1">
                      Toàn chuỗi
                    </ToggleGroupItem>
                  </ToggleGroup>
                </Field>
              )}
            </FieldGroup>
          </CardContent>
          <CardFooter className="flex-col items-stretch gap-3 border-t">
            <Button onClick={download} disabled={busy || sheets.length === 0 || tooLong}>
              {busy ? <Spinner data-icon="inline-start" /> : <DownloadIcon data-icon="inline-start" />}
              {progress ? `Đang tải ${progress.done}/${progress.total}…` : "Xuất Excel"}
            </Button>
            {sheets.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground">Chọn ít nhất một báo cáo.</p>
            ) : (
              <div className="flex flex-col gap-2 text-sm">
                <p className="text-muted-foreground">File gồm {sheets.length} sheet:</p>
                <ol className="flex flex-col gap-1">
                  {sheets.map((sheet, i) => (
                    <li key={sheet.key} className="flex items-center gap-2">
                      <FileSpreadsheetIcon className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">
                        {i + 1}. {sheet.sheet}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Báo cáo</CardTitle>
            <CardDescription>Mỗi lựa chọn là một sheet trong file.</CardDescription>
            <CardAction className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={() => update(new Set(downloadable.map((s) => s.key)))}>
                Chọn tất cả
              </Button>
              <Button variant="ghost" size="sm" onClick={() => update(new Set())} disabled={selected.size === 0}>
                Bỏ chọn
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="grid gap-3 @2xl/main:grid-cols-2">
            {reports.map((report) => {
              const count = report.sheets.filter((s) => selected.has(s.key)).length;
              return (
                <section
                  key={report.title}
                  className={cn("flex flex-col gap-3 rounded-lg border p-4", report.reason && "bg-muted/40")}
                >
                  <div className="flex items-start gap-3">
                    <report.icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-sm font-medium">{report.title}</h3>
                        {count > 0 && !report.reason && <Badge variant="secondary">{count}</Badge>}
                      </div>
                      <p className="text-sm text-pretty text-muted-foreground">{report.description}</p>
                      {report.reason && <p className="text-sm text-warning">{report.reason}</p>}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-x-5 gap-y-2 pl-7">
                    {report.sheets.map((sheet) => (
                      <Field
                        key={sheet.key}
                        orientation="horizontal"
                        className="w-auto"
                        data-disabled={report.reason ? true : undefined}
                      >
                        <Checkbox
                          id={`sheet-${sheet.key}`}
                          checked={!report.reason && selected.has(sheet.key)}
                          disabled={!!report.reason || busy}
                          onCheckedChange={(checked) => toggle(sheet.key, checked === true)}
                        />
                        <FieldLabel htmlFor={`sheet-${sheet.key}`} className="font-normal">
                          {sheet.label}
                        </FieldLabel>
                      </Field>
                    ))}
                  </div>
                </section>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

export default function ReportDownloadsPage() {
  return (
    <Suspense>
      <ReportDownloadsView />
    </Suspense>
  );
}
