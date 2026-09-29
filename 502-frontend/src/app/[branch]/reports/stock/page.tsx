"use client";

import { Suspense, useState } from "react";
import { BoxesIcon, HistoryIcon, SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { EmptyState, TableEmpty } from "@/components/data-states";
import { formatDateRange } from "@/components/date-range-picker";
import { InfoPopover } from "@/components/info-popover";
import { ProductLedgerSheet, type LedgerProduct } from "@/components/inventory/product-ledger-sheet";
import { PageHeader } from "@/components/layout/page-header";
import { ReportToolbar } from "@/components/reports/report-toolbar";
import { StatTile } from "@/components/stat-tile";
import { useApiData } from "@/hooks/use-api-data";
import { rangeParams, useReportFilters, useReportScope } from "@/hooks/use-report-filters";
import { useBranchCode } from "@/lib/branch";
import { exportWorkbook } from "@/lib/excel-export";
import { formatNumber } from "@/lib/format";
import { BUSINESS_DAY_HINT, NO_CATEGORY } from "@/lib/labels";
import { INVENTORY_COLUMNS, stockQuantitySheet } from "@/lib/report-sheets";
import { reportFileName } from "@/lib/reports";
import { SHOW_FROM } from "@/lib/responsive";
import type { InventoryFlows, InventoryReport, InventoryReportRow } from "@/lib/types";
import { cn } from "@/lib/utils";

const ALL = "all";
const NONE = "none"; // products without a category
const OUT = "out"; // nothing left at the end of the range

// Tồn đầu, Nhập, Xuất, Tồn cuối and the narrowest width that shows each.
const SHOW: Partial<Record<keyof InventoryFlows, string>> = {
  opening: SHOW_FROM.sm,
  stockIn: SHOW_FROM.xs,
  stockOut: SHOW_FROM.xs,
};
const FLOWS = INVENTORY_COLUMNS.map((flow) => ({ ...flow, show: SHOW[flow.key] }));
const NUM = "text-right tabular-nums";

const categoryKey = (row: InventoryReportRow) => (row.categoryId === null ? NONE : String(row.categoryId));
const rowKey = (row: InventoryReportRow) => `${row.branchCode}-${row.productId}`;

// Tồn kho theo số lượng: per product, the opening balance, what came in and
// went out and the closing balance of the range, from the stock ledger (the
// quantities of Xuất nhập tồn). A range ending today closes on today's stock.
function StockView() {
  const branch = useBranchCode();
  const { filters, setFilters } = useReportFilters();
  const [category, setCategory] = useState(ALL);
  const [view, setView] = useState(ALL);
  const [search, setSearch] = useState("");
  const [ledgerOf, setLedgerOf] = useState<LedgerProduct | null>(null);
  const { data, loading } = useApiData<InventoryReport | null>(
    "/reports/inventory",
    rangeParams(branch, filters),
    null,
    "Không thể tải báo cáo tồn kho",
  );
  const scope = useReportScope(data);
  const all = data?.rows ?? [];

  const categories = new Map<string, string>();
  for (const row of all) {
    const label =
      row.categoryId === null
        ? NO_CATEGORY
        : scope.chain
          ? `${row.categoryName ?? NO_CATEGORY} · ${row.branchCode.toUpperCase()}`
          : (row.categoryName ?? NO_CATEGORY);
    categories.set(categoryKey(row), label);
  }
  // A category that is gone after a reload falls back to all of them.
  const selected = category === ALL || categories.has(category) ? category : ALL;
  const keyword = search.trim().toLowerCase();
  const rows = all.filter(
    (row) =>
      (selected === ALL || categoryKey(row) === selected) &&
      (view === ALL || row.closing.quantity <= 0) &&
      (!keyword || row.name.toLowerCase().includes(keyword)),
  );

  const inStock = all.filter((row) => row.closing.quantity > 0).length;
  const outOfStock = all.filter((row) => row.closing.quantity === 0).length;
  const negative = all.filter((row) => row.closing.quantity < 0).length;
  const moved = all.filter((row) => row.stockIn.quantity !== 0 || row.stockOut.quantity !== 0).length;

  // Every product and every flow, whatever the filters on screen.
  const exportExcel = async () => {
    if (!data) return;
    await exportWorkbook(reportFileName("ton-kho", scope.fileScope, data.range.from, data.range.to), [
      stockQuantitySheet(data.rows),
    ]);
  };

  const openLedger = (row: InventoryReportRow) =>
    setLedgerOf({ id: row.productId, name: row.name, unit: row.unit, branch: row.branchCode });

  return (
    <>
      <PageHeader
        title="Tồn kho"
        description={scope.name}
        info={`Số lượng theo sổ kho: tồn đầu kỳ + nhập − xuất = tồn cuối kỳ. Khoảng ngày kết thúc hôm nay thì tồn cuối là tồn hiện tại (hàng gọi trong phòng đang mở chỉ trừ khi thanh toán). ${BUSINESS_DAY_HINT}`}
      />
      <ReportToolbar filters={filters} onChange={setFilters} onExport={data && !loading ? exportExcel : undefined} periods={false} />

      {!data ? (
        <>
          <div className="grid gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-80 rounded-xl" />
        </>
      ) : (
        <div className={cn("flex flex-col gap-4 transition-opacity md:gap-6", loading && "opacity-60")}>
          <div className="grid gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
            <StatTile label="Mặt hàng" value={formatNumber(all.length)} footer={`${formatNumber(moved)} món có nhập hoặc xuất trong kỳ`} />
            <StatTile label="Còn hàng" value={formatNumber(inStock)} footer="Tồn cuối kỳ lớn hơn 0" />
            <StatTile label="Hết hàng" value={formatNumber(outOfStock)} footer="Tồn cuối kỳ bằng 0" />
            <StatTile
              label="Âm kho"
              value={formatNumber(negative)}
              footer={negative > 0 ? "Bán vượt tồn — hãy lập phiếu nhập bổ sung" : "Không có món bán vượt tồn"}
            />
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-1">
                <CardTitle>Theo món</CardTitle>
                <InfoPopover>
                  Xuất gồm bán hàng và phiếu xuất kho, đã trừ hàng trả lại kho khi hủy hóa đơn hay phiếu xuất; nhập đã trừ phiếu
                  nhập bị hủy. Bấm vào một món để xem sổ kho của nó. File Excel có đủ mọi món, kèm chi tiết bán, phiếu xuất và
                  hoàn / điều chỉnh.
                </InfoPopover>
              </div>
              <CardDescription>{formatDateRange(data.range)}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {all.length === 0 ? (
                <EmptyState
                  icon={BoxesIcon}
                  title="Không có hàng tồn hay biến động"
                  description={`Không có món nào còn tồn hoặc nhập, bán, xuất trong ${formatDateRange(data.range)}.`}
                />
              ) : (
                <>
                  <div className="flex flex-col gap-3 @3xl/main:flex-row @3xl/main:items-center">
                    <InputGroup className="@3xl/main:max-w-64">
                      <InputGroupAddon>
                        <SearchIcon />
                      </InputGroupAddon>
                      <InputGroupInput
                        placeholder="Tìm mặt hàng"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        aria-label="Tìm mặt hàng"
                      />
                    </InputGroup>
                    {categories.size > 1 && (
                      <Select value={selected} onValueChange={setCategory}>
                        <SelectTrigger className="w-full @3xl/main:w-56" aria-label="Danh mục">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={ALL}>Tất cả danh mục</SelectItem>
                          {[...categories].map(([key, name]) => (
                            <SelectItem key={key} value={key}>
                              {name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <ToggleGroup
                      type="single"
                      variant="outline"
                      size="sm"
                      value={view}
                      onValueChange={(v) => v && setView(v)}
                      className="@3xl/main:ml-auto"
                      aria-label="Lọc tồn kho"
                    >
                      <ToggleGroupItem value={ALL}>Tất cả</ToggleGroupItem>
                      <ToggleGroupItem value={OUT}>Hết hàng · {formatNumber(outOfStock + negative)}</ToggleGroupItem>
                    </ToggleGroup>
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tên mặt hàng</TableHead>
                        <TableHead className={SHOW_FROM.md}>ĐVT</TableHead>
                        {FLOWS.map((flow) => (
                          <TableHead key={flow.key} className={cn(NUM, flow.show)}>
                            {flow.label}
                          </TableHead>
                        ))}
                        <TableHead className={cn("w-12", SHOW_FROM.sm)} />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.length === 0 ? (
                        <TableEmpty colSpan={FLOWS.length + 3} icon={BoxesIcon} title="Không có mặt hàng phù hợp" description="Thử bộ lọc khác." />
                      ) : (
                        rows.map((row) => (
                          <TableRow key={rowKey(row)} className="cursor-pointer" onClick={() => openLedger(row)}>
                            <TableCell className="font-medium whitespace-normal">
                              <div>{row.name}</div>
                              <div className="text-xs font-normal text-muted-foreground">
                                {[
                                  row.categoryName ?? NO_CATEGORY,
                                  scope.chain ? row.branchCode.toUpperCase() : null,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                                <span className="@3xl/main:hidden">{row.unit && ` · ${row.unit}`}</span>
                              </div>
                            </TableCell>
                            <TableCell className={SHOW_FROM.md}>{row.unit}</TableCell>
                            {FLOWS.map((flow) => {
                              const closing = flow.key === "closing";
                              const quantity = row[flow.key].quantity;
                              return (
                                <TableCell
                                  key={flow.key}
                                  className={cn(
                                    NUM,
                                    flow.show,
                                    closing && "font-medium",
                                    closing && quantity < 0 && "text-destructive",
                                    !closing && quantity === 0 && "text-muted-foreground",
                                  )}
                                >
                                  {formatNumber(quantity)}
                                </TableCell>
                              );
                            })}
                            <TableCell className={SHOW_FROM.sm}>
                              {/* The click reaches the row, which opens the ledger. */}
                              <Button variant="ghost" size="icon-sm" aria-label={`Sổ kho ${row.name}`}>
                                <HistoryIcon />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <ProductLedgerSheet product={ledgerOf} onOpenChange={(open) => !open && setLedgerOf(null)} />
    </>
  );
}

export default function StockReportPage() {
  return (
    <Suspense>
      <StockView />
    </Suspense>
  );
}
