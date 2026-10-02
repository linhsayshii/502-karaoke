"use client";

import { Suspense, useState } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon, ReceiptTextIcon, SearchIcon } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import { ListLimitNotice, TableEmpty, TableSkeleton } from "@/components/data-states";
import { DateRangePicker, formatDateRange, type DateRangeValue } from "@/components/date-range-picker";
import { ExportExcelButton } from "@/components/export-excel-button";
import { PageHeader } from "@/components/layout/page-header";
import { AddManualBillDialog } from "@/components/report-site/add-manual-bill-dialog";
import { StatTile } from "@/components/stat-tile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApiData } from "@/hooks/use-api-data";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useBranchCode } from "@/lib/branch";
import { exportWorkbook } from "@/lib/excel-export";
import { businessDate, formatDate, formatMoney, formatNumber } from "@/lib/format";
import { BUSINESS_DAY_HINT, einvoiceStatusBadge, NO_ROOM } from "@/lib/labels";
import { can } from "@/lib/permissions";
import { reportSiteEinvoicesSheet } from "@/lib/report-sheets";
import { reportFileName } from "@/lib/reports";
import { ONLY_NARROW, SHOW_FROM } from "@/lib/responsive";
import type { CreatedManualBill, ReportSiteEinvoice, ReportSiteSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

const NUM = "text-right tabular-nums";
const COLUMNS = ["", SHOW_FROM.sm, SHOW_FROM.md, SHOW_FROM.xs, SHOW_FROM.lg, "", SHOW_FROM.md, SHOW_FROM.sm, ""];

// The HĐĐT page with the bill open on this e-invoice, its day listed (spec
// 2026-10-02-bao-cao-theo-tung-hddt §5.2).
function einvoicesHref(
  branch: string,
  row: { orderId: number | null; manualBillId: number | null; invoiceDate: string; id?: number },
) {
  const params = new URLSearchParams(
    row.manualBillId !== null ? { manualBill: String(row.manualBillId) } : { bill: String(row.orderId) },
  );
  params.set("day", row.invoiceDate);
  if (row.id !== undefined) params.set("einvoice", String(row.id));
  return `/${branch}/sales/einvoices?${params}`;
}

// Quản lý bán hàng of the report site: one row per e-invoice (sent by a
// cashier, split from a bill, or of a bill thêm tay), on its invoice date.
function BillsView() {
  const { user } = useAuth();
  const branch = useBranchCode();
  const router = useRouter();
  const canWrite = can(user, "einvoices.write");
  const [range, setRange] = useState<DateRangeValue>(() => ({ from: businessDate(), to: businessDate() }));
  const [search, setSearch] = useState("");
  // A number (digits, at most 15 as the backend takes) searches every day.
  const number = useDebouncedValue(search).replace(/\D/g, "");
  const rows = useApiData<ReportSiteEinvoice[]>(
    "/report-site/einvoices",
    { branch, ...(number ? { number } : range) },
    [],
    "Không thể tải danh sách hóa đơn",
  );
  // Summed by the server over every invoice of the days, never from the list.
  const summary = useApiData<ReportSiteSummary | null>(
    "/report-site/bills/summary",
    { branch, ...range },
    null,
    "Không thể tải tổng",
  );
  const [adding, setAdding] = useState(false);
  const [addKey, setAddKey] = useState(0);

  const startAdding = () => {
    setAddKey((key) => key + 1);
    setAdding(true);
  };
  const created = (bill: CreatedManualBill) => {
    setAdding(false);
    router.push(
      einvoicesHref(branch, {
        orderId: null,
        manualBillId: bill.id,
        invoiceDate: bill.businessDate,
        id: bill.einvoiceId,
      }),
    );
  };
  const exportExcel = async () => {
    const name = number
      ? `quan-ly-ban-hang_${branch}_${number}.xlsx`
      : reportFileName("quan-ly-ban-hang", branch, range.from, range.to);
    await exportWorkbook(name, [reportSiteEinvoicesSheet(rows.data)]);
    if (rows.total !== null && rows.total > rows.data.length) {
      toast.warning(
        `File chỉ gồm ${formatNumber(rows.data.length)} / ${formatNumber(rows.total)} hóa đơn mới nhất; chọn khoảng ngày ngắn hơn để có đủ.`,
      );
    }
  };

  const s = summary.data;
  return (
    <>
      <PageHeader
        title="Quản lý bán hàng"
        info={`Từng hóa đơn điện tử: thu ngân gửi sang, chia từ bill, hoặc của bill thêm tay, theo ngày hóa đơn (một bill chia nhiều hóa đơn khác ngày thì nằm ở nhiều ngày). Hóa đơn chưa xuất của bill đã hủy không được tính. ${BUSINESS_DAY_HINT}`}
        actions={
          canWrite && (
            <Button onClick={startAdding}>
              <PlusIcon data-icon="inline-start" />
              Thêm hóa đơn
            </Button>
          )
        }
      />
      {/* The header keeps the one main action; the date and the export wrap in a
          row below it, as the reports' toolbar does. Beside the title, three
          controls left it a few pixels between 768 and ~1000 px (the sidebar
          takes 16rem) and a long range pushed the page sideways. The export
          waits for a reload: the rows shown meanwhile are the previous range's. */}
      <div className="flex flex-wrap items-center gap-2">
        <DateRangePicker value={range} onChange={setRange} />
        <ExportExcelButton
          className="@xl/main:ml-auto"
          onExport={rows.data.length > 0 && !rows.loading ? exportExcel : undefined}
        />
      </div>

      <div className="grid gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
        <StatTile label="Hóa đơn điện tử" value={s ? formatNumber(s.einvoiceCount) : "…"} />
        <StatTile label="Tổng tiền" value={s ? formatMoney(s.total) : "…"} footer={s ? `Trước VAT ${formatMoney(s.revenue)}` : undefined} />
        <StatTile label="VAT" value={s ? formatMoney(s.vat) : "…"} />
        <StatTile label="Đã xuất" value={s ? formatMoney(s.issued) : "…"} footer={s ? `Chưa xuất ${formatMoney(s.pending)}` : undefined} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{number ? `Số hóa đơn ${number}` : formatDateRange(range)}</CardTitle>
          <CardDescription>
            {number ? "Kết quả tìm trên mọi ngày" : "Bấm một hóa đơn để mở ở trang Hóa đơn điện tử."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <InputGroup className="sm:max-w-64">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              placeholder="Tìm số hóa đơn"
              inputMode="numeric"
              maxLength={15}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Tìm theo số hóa đơn"
            />
          </InputGroup>
          <ListLimitNotice
            shown={rows.data.length}
            total={rows.total}
            noun="hóa đơn"
            hint="Các ô tổng ở trên vẫn tính đủ mọi hóa đơn của khoảng này; chọn khoảng ngày ngắn hơn hoặc tìm theo số hóa đơn."
          />
          <div className={cn("transition-opacity", rows.loading && rows.data.length > 0 && "opacity-60")}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Số hóa đơn</TableHead>
                  <TableHead className={SHOW_FROM.sm}>Ngày HĐ</TableHead>
                  <TableHead className={SHOW_FROM.md}>Bill</TableHead>
                  <TableHead className={SHOW_FROM.xs}>Phòng</TableHead>
                  <TableHead className={SHOW_FROM.lg}>Người mua</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead className={cn("text-right", SHOW_FROM.md)}>Trước VAT</TableHead>
                  <TableHead className={cn("text-right", SHOW_FROM.sm)}>VAT</TableHead>
                  <TableHead className="text-right">Tổng</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.loading && rows.data.length === 0 ? (
                  <TableSkeleton columns={COLUMNS} />
                ) : rows.data.length === 0 ? (
                  <TableEmpty
                    colSpan={9}
                    icon={ReceiptTextIcon}
                    title="Không có hóa đơn"
                    description="Chưa có hóa đơn điện tử nào trong khoảng này."
                  />
                ) : (
                  rows.data.map((row) => {
                    const badge = einvoiceStatusBadge(row.status, row.hasError ? "!" : null);
                    return (
                      <TableRow
                        key={row.id}
                        className={cn("cursor-pointer", row.billCancelledAt && "text-muted-foreground")}
                        onClick={() => router.push(einvoicesHref(branch, row))}
                      >
                        <TableCell className="font-medium tabular-nums">
                          <div className="flex flex-wrap items-center gap-1">
                            {row.reportNumber}
                            {row.manualBillId !== null && <Badge variant="outline">Thêm tay</Badge>}
                            {row.billCancelledAt && <Badge variant="warning">Đã hủy</Badge>}
                          </div>
                          <div className={cn("text-xs font-normal text-muted-foreground", ONLY_NARROW)}>
                            {formatDate(row.invoiceDate)} · {row.roomName ?? NO_ROOM}
                          </div>
                        </TableCell>
                        <TableCell className={cn("tabular-nums", SHOW_FROM.sm)}>{formatDate(row.invoiceDate)}</TableCell>
                        <TableCell className={cn("tabular-nums", SHOW_FROM.md)}>
                          {row.manualBillId !== null ? "Thêm tay" : (row.billNumber ?? "—")}
                        </TableCell>
                        <TableCell className={SHOW_FROM.xs}>{row.roomName ?? NO_ROOM}</TableCell>
                        <TableCell className={cn("max-w-56 truncate", SHOW_FROM.lg)}>{row.buyerName ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant={badge.variant}>{badge.label}</Badge>
                          {row.invoiceNumber !== null && (
                            <div className="text-xs text-muted-foreground tabular-nums">Số {row.invoiceNumber}</div>
                          )}
                        </TableCell>
                        <TableCell className={cn(NUM, SHOW_FROM.md)}>{formatNumber(row.amount - row.vatAmount)}</TableCell>
                        <TableCell className={cn(NUM, SHOW_FROM.sm)}>{formatNumber(row.vatAmount)}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{formatNumber(row.amount)}</TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <AddManualBillDialog key={addKey} open={adding} onOpenChange={setAdding} onCreated={created} />
    </>
  );
}

export default function ReportBillsPage() {
  return (
    <Suspense>
      <BillsView />
    </Suspense>
  );
}
