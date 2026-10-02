"use client";

import { Suspense, useState } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon, ReceiptTextIcon, SearchIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import { ListLimitNotice, TableEmpty, TableSkeleton } from "@/components/data-states";
import { DateRangePicker, formatDateRange, type DateRangeValue } from "@/components/date-range-picker";
import { ExportExcelButton } from "@/components/export-excel-button";
import { PageHeader } from "@/components/layout/page-header";
import { ReasonDialog } from "@/components/reason-dialog";
import { AddManualBillDialog } from "@/components/report-site/add-manual-bill-dialog";
import { StatTile } from "@/components/stat-tile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApiData } from "@/hooks/use-api-data";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useNotify } from "@/hooks/use-notify";
import api from "@/lib/api";
import { useBranchCode } from "@/lib/branch";
import { exportWorkbook } from "@/lib/excel-export";
import { businessDate, formatDate, formatMoney, formatNumber } from "@/lib/format";
import { BUSINESS_DAY_HINT, NO_ROOM } from "@/lib/labels";
import { can } from "@/lib/permissions";
import { reportSiteBillsSheet } from "@/lib/report-sheets";
import { reportFileName } from "@/lib/reports";
import { ONLY_NARROW, SHOW_FROM } from "@/lib/responsive";
import type { CreatedManualBill, ReportSiteBill, ReportSiteSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

const NUM = "text-right tabular-nums";
const COLUMNS = ["", SHOW_FROM.sm, SHOW_FROM.xs, SHOW_FROM.md, SHOW_FROM.md, SHOW_FROM.sm, "", ""];

// The HĐĐT page with the bill open and its day listed (spec 2026-10-02 §7.4).
function einvoicesHref(
  branch: string,
  bill: { orderId: number | null; manualBillId: number | null; businessDate: string | null },
) {
  const params = new URLSearchParams(
    bill.manualBillId !== null ? { manualBill: String(bill.manualBillId) } : { bill: String(bill.orderId) },
  );
  if (bill.businessDate) params.set("day", bill.businessDate);
  return `/${branch}/sales/einvoices?${params}`;
}

// Quản lý bán hàng of the report site: the paid bills holding an e-invoice and
// the bills thêm tay, with their e-invoices' sums.
function BillsView() {
  const { user } = useAuth();
  const branch = useBranchCode();
  const router = useRouter();
  const notify = useNotify();
  const canWrite = can(user, "einvoices.write");
  const [range, setRange] = useState<DateRangeValue>(() => ({ from: businessDate(), to: businessDate() }));
  const [search, setSearch] = useState("");
  // A bill number (digits, at most 15 as the backend takes) searches every day.
  const billNumber = useDebouncedValue(search).replace(/\D/g, "");
  const bills = useApiData<ReportSiteBill[]>(
    "/report-site/bills",
    { branch, ...(billNumber ? { billNumber } : range) },
    [],
    "Không thể tải danh sách bill",
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
  const [cancelling, setCancelling] = useState<ReportSiteBill | null>(null);

  const startAdding = () => {
    setAddKey((key) => key + 1);
    setAdding(true);
  };
  const created = (bill: CreatedManualBill) => {
    setAdding(false);
    router.push(einvoicesHref(branch, { orderId: null, manualBillId: bill.id, businessDate: bill.businessDate }));
  };
  const cancel = async (reason: string) => {
    if (!cancelling?.manualBillId) return false;
    try {
      await api.post(`/report-site/manual-bills/${cancelling.manualBillId}/cancel`, { reason });
      notify.success(`Đã hủy bill ${cancelling.billNumber}`);
      bills.reload();
      summary.reload();
      return true;
    } catch (error) {
      notify.error(error, "Không hủy được bill");
      return false;
    }
  };
  const exportExcel = async () => {
    const name = billNumber
      ? `quan-ly-ban-hang_${branch}_${billNumber}.xlsx`
      : reportFileName("quan-ly-ban-hang", branch, range.from, range.to);
    await exportWorkbook(name, [reportSiteBillsSheet(bills.data)]);
    if (bills.total !== null && bills.total > bills.data.length) {
      toast.warning(
        `File chỉ gồm ${formatNumber(bills.data.length)} / ${formatNumber(bills.total)} bill mới nhất; chọn khoảng ngày ngắn hơn để có đủ.`,
      );
    }
  };

  const s = summary.data;
  return (
    <>
      <PageHeader
        title="Quản lý bán hàng"
        info={`Bill đã có hóa đơn điện tử bên trang chính và bill thêm tay, theo ngày kinh doanh của bill. Số tiền là của các hóa đơn điện tử; hóa đơn chưa xuất của bill đã hủy không được tính. ${BUSINESS_DAY_HINT}`}
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
          onExport={bills.data.length > 0 && !bills.loading ? exportExcel : undefined}
        />
      </div>

      <div className="grid gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
        <StatTile label="Bill" value={s ? formatNumber(s.billCount) : "…"} footer={s ? `${formatNumber(s.einvoiceCount)} hóa đơn điện tử` : undefined} />
        <StatTile label="Tổng tiền" value={s ? formatMoney(s.total) : "…"} footer={s ? `Trước VAT ${formatMoney(s.revenue)}` : undefined} />
        <StatTile label="VAT" value={s ? formatMoney(s.vat) : "…"} />
        <StatTile label="Đã xuất" value={s ? formatMoney(s.issued) : "…"} footer={s ? `Chưa xuất ${formatMoney(s.pending)}` : undefined} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{billNumber ? `Số bill ${billNumber}` : formatDateRange(range)}</CardTitle>
          <CardDescription>
            {billNumber ? "Kết quả tìm trên mọi ngày" : "Bấm một bill để mở ở trang Hóa đơn điện tử."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <InputGroup className="sm:max-w-64">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              placeholder="Tìm số bill"
              inputMode="numeric"
              maxLength={15}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Tìm theo số bill"
            />
          </InputGroup>
          <ListLimitNotice
            shown={bills.data.length}
            total={bills.total}
            noun="bill"
            hint="Các ô tổng ở trên vẫn tính đủ mọi bill của khoảng này; chọn khoảng ngày ngắn hơn hoặc tìm theo số bill."
          />
          <div className={cn("transition-opacity", bills.loading && bills.data.length > 0 && "opacity-60")}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Số bill</TableHead>
                  <TableHead className={SHOW_FROM.sm}>Ngày</TableHead>
                  <TableHead className={SHOW_FROM.xs}>Phòng</TableHead>
                  <TableHead className={cn("text-right", SHOW_FROM.md)}>HĐĐT</TableHead>
                  <TableHead className={cn("text-right", SHOW_FROM.md)}>Trước VAT</TableHead>
                  <TableHead className={cn("text-right", SHOW_FROM.sm)}>VAT</TableHead>
                  <TableHead className="text-right">Tổng</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {bills.loading && bills.data.length === 0 ? (
                  <TableSkeleton columns={COLUMNS} />
                ) : bills.data.length === 0 ? (
                  <TableEmpty
                    colSpan={8}
                    icon={ReceiptTextIcon}
                    title="Không có bill"
                    description="Chưa có bill nào có hóa đơn điện tử trong khoảng này."
                  />
                ) : (
                  bills.data.map((bill) => (
                    <TableRow
                      key={bill.manualBillId !== null ? `m${bill.manualBillId}` : `o${bill.orderId}`}
                      className={cn("cursor-pointer", bill.cancelledAt && "text-muted-foreground")}
                      onClick={() => router.push(einvoicesHref(branch, bill))}
                    >
                      <TableCell className="font-medium tabular-nums">
                        <div className="flex flex-wrap items-center gap-1">
                          {bill.billNumber}
                          {bill.manualBillId !== null && <Badge variant="outline">Thêm tay</Badge>}
                          {bill.cancelledAt && <Badge variant="warning">Đã hủy</Badge>}
                        </div>
                        <div className={cn("text-xs font-normal text-muted-foreground", ONLY_NARROW)}>
                          {formatDate(bill.businessDate)} · {bill.roomName ?? NO_ROOM}
                        </div>
                      </TableCell>
                      <TableCell className={cn("tabular-nums", SHOW_FROM.sm)}>{formatDate(bill.businessDate)}</TableCell>
                      <TableCell className={SHOW_FROM.xs}>{bill.roomName ?? NO_ROOM}</TableCell>
                      <TableCell className={cn(NUM, SHOW_FROM.md)}>
                        {bill.issuedCount}/{bill.einvoiceCount}
                      </TableCell>
                      <TableCell className={cn(NUM, SHOW_FROM.md)}>{formatNumber(bill.total - bill.vat)}</TableCell>
                      <TableCell className={cn(NUM, SHOW_FROM.sm)}>{formatNumber(bill.vat)}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{formatNumber(bill.total)}</TableCell>
                      <TableCell className="px-1" onClick={(e) => e.stopPropagation()}>
                        {canWrite && bill.manualBillId !== null && !bill.cancelledAt && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Hủy bill ${bill.billNumber}`}
                            title="Hủy bill thêm tay"
                            onClick={() => setCancelling(bill)}
                          >
                            <XIcon />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <AddManualBillDialog key={addKey} open={adding} onOpenChange={setAdding} onCreated={created} />
      <ReasonDialog
        open={cancelling !== null}
        onOpenChange={(open) => !open && setCancelling(null)}
        title={`Hủy bill ${cancelling?.billNumber ?? ""}?`}
        description="Các hóa đơn nháp của bill bị xóa cùng. Bill đã có hóa đơn gửi hoặc xuất thì không hủy được. Số bill không được cấp lại."
        confirmLabel="Hủy bill"
        maxLength={300} // the most the backend takes (CancelManualBillDto.reason, spec §6.1)
        onConfirm={cancel}
      />
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
