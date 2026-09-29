"use client";

import { useCallback, useEffect, useState } from "react";
import { BanIcon, CircleAlertIcon, FileTextIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ListLimitNotice, TableEmpty, TableSkeleton } from "@/components/data-states";
import { DateRangePicker, formatDateRange, type DateRangeValue } from "@/components/date-range-picker";
import { useAuth } from "@/components/auth-provider";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/layout/page-header";
import { LineItemsTable } from "@/components/line-items-table";
import { ReasonDialog } from "@/components/reason-dialog";
import { useNotify } from "@/hooks/use-notify";
import api, { totalCountOf } from "@/lib/api";
import { useBranchCode } from "@/lib/branch";
import { businessDate, firstDayOfMonth, formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { BUSINESS_DAY_HINT, DOC_TYPE_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/labels";
import { ONLY_NARROW, SHOW_FROM } from "@/lib/responsive";
import type { StockDocType, StockDocument, StockDocumentsSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

const ALL = "ALL";

function paymentOf(doc: StockDocument) {
  if (doc.type === "EXPORT") return "—";
  if (!doc.fundTransaction) return "Chưa trả";
  return PAYMENT_METHOD_LABELS[doc.fundTransaction.method];
}

export default function StockDocumentsPage() {
  const branch = useBranchCode();
  const notify = useNotify();
  const [range, setRange] = useState<DateRangeValue>(() => ({ from: firstDayOfMonth(), to: businessDate() }));
  const [type, setType] = useState<StockDocType | typeof ALL>(ALL);
  const [documents, setDocuments] = useState<StockDocument[] | null>(null);
  // How many documents match in all; the list holds the newest 200.
  const [total, setTotal] = useState<number | null>(null);
  const [summary, setSummary] = useState<StockDocumentsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [res, totals] = await Promise.all([
        api.get<StockDocument[]>("/inventory/documents", {
          params: { branch, ...range, type: type === ALL ? undefined : type },
        }),
        api.get<StockDocumentsSummary>("/inventory/documents/summary", { params: { branch, ...range } }),
      ]);
      setDocuments(res.data);
      setTotal(totalCountOf(res));
      setSummary(totals.data);
    } catch (error) {
      notify.error(error, "Không thể tải danh sách phiếu kho");
    } finally {
      setLoading(false);
    }
  }, [branch, range, type, notify]);

  useEffect(() => {
    load();
  }, [load]);


  return (
    <>
      <PageHeader
        title="Phiếu kho"
        info={`Phiếu nhập và phiếu xuất của cơ sở. ${BUSINESS_DAY_HINT}`}
        actions={<DateRangePicker value={range} onChange={setRange} align="end" />}
      />

      <Card>
        <CardHeader>
          <CardTitle>{formatDateRange(range)}</CardTitle>
          <CardDescription>
            {/* Summed by the server over every document of the period, not only the listed ones. */}
            {summary
              ? `Nhập ${formatMoney(summary.importTotal)} · xuất ${formatMoney(summary.exportTotal)} (theo giá vốn, không tính phiếu đã hủy)`
              : "Đang tính tổng…"}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={type}
            onValueChange={(v) => v && setType(v as StockDocType | typeof ALL)}
            aria-label="Loại phiếu"
          >
            <ToggleGroupItem value={ALL}>Tất cả</ToggleGroupItem>
            <ToggleGroupItem value="IMPORT">{DOC_TYPE_LABELS.IMPORT}</ToggleGroupItem>
            <ToggleGroupItem value="EXPORT">{DOC_TYPE_LABELS.EXPORT}</ToggleGroupItem>
          </ToggleGroup>

          {documents && (
            <ListLimitNotice
              shown={documents.length}
              total={total}
              noun="phiếu"
              hint="Tổng nhập, xuất ở trên vẫn tính đủ mọi phiếu của khoảng này. Chọn khoảng ngày ngắn hơn để xem đủ danh sách."
            />
          )}

          <div className={cn("transition-opacity", loading && documents && "opacity-60")}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mã phiếu</TableHead>
                  <TableHead className={SHOW_FROM.sm}>Loại</TableHead>
                  <TableHead className={SHOW_FROM.sm}>Thời gian</TableHead>
                  <TableHead className={SHOW_FROM.md}>Nhà cung cấp / ghi chú</TableHead>
                  <TableHead className={cn("text-right", SHOW_FROM.lg)}>Số dòng</TableHead>
                  <TableHead className="text-right">Tổng tiền</TableHead>
                  <TableHead className={SHOW_FROM.md}>Thanh toán</TableHead>
                  <TableHead className={SHOW_FROM.lg}>Người lập</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!documents ? (
                  <TableSkeleton
                    columns={[
                      "",
                      SHOW_FROM.sm,
                      SHOW_FROM.sm,
                      SHOW_FROM.md,
                      SHOW_FROM.lg,
                      "",
                      SHOW_FROM.md,
                      SHOW_FROM.lg,
                    ]}
                  />
                ) : documents.length === 0 ? (
                  <TableEmpty
                    colSpan={8}
                    icon={FileTextIcon}
                    title="Không có phiếu nào"
                    description="Không có phiếu nhập/xuất trong khoảng thời gian này."
                  />
                ) : (
                  documents.map((doc) => (
                    <TableRow
                      key={doc.id}
                      className={cn("cursor-pointer", doc.cancelledAt && "text-muted-foreground")}
                      onClick={() => setSelectedId(doc.id)}
                    >
                      <TableCell>
                        <div className={cn("font-mono text-xs font-medium", doc.cancelledAt && "line-through")}>
                          {doc.code}
                        </div>
                        <div className={cn("text-xs text-muted-foreground", ONLY_NARROW)}>
                          {DOC_TYPE_LABELS[doc.type]}
                          {doc.cancelledAt && " (đã hủy)"} · {formatDateTime(doc.createdAt)}
                        </div>
                      </TableCell>
                      <TableCell className={SHOW_FROM.sm}>
                        <span className="flex items-center gap-1">
                          <Badge variant={doc.type === "IMPORT" ? "default" : "secondary"}>
                            {DOC_TYPE_LABELS[doc.type]}
                          </Badge>
                          {doc.cancelledAt && <Badge variant="outline">Đã hủy</Badge>}
                        </span>
                      </TableCell>
                      <TableCell className={cn("tabular-nums", SHOW_FROM.sm)}>
                        {formatDateTime(doc.createdAt)}
                      </TableCell>
                      <TableCell className={cn("max-w-56 truncate", SHOW_FROM.md)}>
                        {[doc.supplier, doc.note].filter(Boolean).join(" – ") || "—"}
                      </TableCell>
                      <TableCell className={cn("text-right tabular-nums", SHOW_FROM.lg)}>
                        {doc._count?.lines ?? 0}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatNumber(doc.totalAmount)}
                      </TableCell>
                      <TableCell className={SHOW_FROM.md}>{paymentOf(doc)}</TableCell>
                      <TableCell className={SHOW_FROM.lg}>{doc.createdBy.fullName}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <DocumentSheet id={selectedId} onOpenChange={(open) => !open && setSelectedId(null)} onChanged={load} />
    </>
  );
}

function DocumentSheet({
  id,
  onOpenChange,
  onChanged,
}: {
  id: number | null;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  // Keep showing the last document while the sheet animates closed.
  const [shownId, setShownId] = useState(id);
  if (id !== null && id !== shownId) setShownId(id);

  return (
    <Sheet open={id !== null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 sm:max-w-xl">
        {shownId !== null && <DocumentDetail key={shownId} id={shownId} onChanged={onChanged} />}
      </SheetContent>
    </Sheet>
  );
}

function DocumentDetail({ id, onChanged }: { id: number; onChanged: () => void }) {
  const notify = useNotify();
  const { user } = useAuth();
  const [doc, setDoc] = useState<StockDocument | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get<StockDocument>(`/inventory/documents/${id}`)
      .then((res) => !cancelled && setDoc(res.data))
      .catch((error) => !cancelled && notify.error(error, "Không thể tải phiếu"));
    return () => {
      cancelled = true;
    };
  }, [id, notify]);

  const cancelDocument = async (reason: string) => {
    if (!doc) return;
    try {
      const res = await api.post<StockDocument>(`/inventory/documents/${doc.id}/cancel`, { reason });
      setDoc(res.data);
      notify.success(`Đã hủy phiếu ${res.data.code}, tồn kho đã được đảo lại`);
      onChanged();
    } catch (error) {
      notify.error(error, "Không thể hủy phiếu");
      return false;
    }
  };

  const isImport = doc?.type === "IMPORT";

  return (
    <>
      <SheetHeader className="border-b">
        <SheetTitle className="flex flex-wrap items-center gap-2">
          {doc ? DOC_TYPE_LABELS[doc.type] : "Phiếu kho"}
          {doc && <span className="font-mono text-sm">{doc.code}</span>}
          {doc?.cancelledAt && <Badge variant="outline">Đã hủy</Badge>}
        </SheetTitle>
        <SheetDescription>
          {doc ? `${formatDateTime(doc.createdAt)} · lập bởi ${doc.createdBy.fullName}` : "Đang tải..."}
        </SheetDescription>
      </SheetHeader>

      <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-4">
        {!doc ? (
          <>
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-40 w-full" />
          </>
        ) : (
          <>
            {doc.cancelledAt && (
              <Alert variant="destructive">
                <CircleAlertIcon />
                <AlertTitle>
                  Đã hủy lúc {formatDateTime(doc.cancelledAt)}
                  {doc.cancelledBy && ` bởi ${doc.cancelledBy.fullName}`}
                </AlertTitle>
                <AlertDescription>{doc.cancelReason}</AlertDescription>
              </Alert>
            )}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              {isImport && (
                <div className="flex flex-col gap-0.5">
                  <dt className="text-xs text-muted-foreground">Nhà cung cấp</dt>
                  <dd>{doc.supplier || "—"}</dd>
                </div>
              )}
              {isImport && (
                <div className="flex flex-col gap-0.5">
                  <dt className="text-xs text-muted-foreground">Thanh toán</dt>
                  <dd>
                    {doc.fundTransaction
                      ? `${PAYMENT_METHOD_LABELS[doc.fundTransaction.method]} · phiếu chi ${formatMoney(doc.fundTransaction.amount)}${
                          doc.fundTransaction.cancelledAt ? " (đã hủy)" : ""
                        }`
                      : "Chưa trả / mua nợ"}
                  </dd>
                </div>
              )}
              <div className="col-span-2 flex flex-col gap-0.5">
                <dt className="text-xs text-muted-foreground">{isImport ? "Ghi chú" : "Lý do xuất"}</dt>
                <dd>{doc.note || "—"}</dd>
              </div>
            </dl>
            <LineItemsTable
              itemLabel="Mặt hàng"
              items={(doc.lines ?? []).map((line) => ({
                ...line,
                name: line.product.name,
                unit: line.product.unit,
                price: line.unitCost,
              }))}
              total={doc.totalAmount}
            />
          </>
        )}
      </div>

      {doc && !doc.cancelledAt && can(user, "inventory") && (
        <SheetFooter className="border-t">
          <Button variant="destructive" onClick={() => setCancelOpen(true)}>
            <BanIcon data-icon="inline-start" />
            Hủy phiếu
          </Button>
        </SheetFooter>
      )}

      <ReasonDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title={`Hủy phiếu ${doc?.code ?? ""}?`}
        description={
          isImport
            ? `Số lượng đã nhập bị trừ lại khỏi tồn kho (chỉ hủy được khi hàng còn trong kho), giá vốn trở về lần nhập trước${
                doc?.fundTransaction ? " và phiếu chi đi kèm bị hủy" : ""
              }.`
            : "Số lượng đã xuất được cộng trả lại vào tồn kho."
        }
        confirmLabel="Hủy phiếu"
        onConfirm={cancelDocument}
      />
    </>
  );
}
