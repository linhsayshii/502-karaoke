"use client";

import { HistoryIcon, RefreshCwIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableEmpty, TableSkeleton } from "@/components/data-states";
import { PageHeader } from "@/components/layout/page-header";
import { useApiData } from "@/hooks/use-api-data";
import { formatDateTime, formatNumber } from "@/lib/format";
import { ONLY_NARROW, SHOW_FROM } from "@/lib/responsive";
import type { DataPurgeLog } from "@/lib/types";
import { cn } from "@/lib/utils";

// What a purge deleted, in the order worth reading (tables of the backend's
// DataPurgeService).
const DELETED_LABELS: [string, string][] = [
  ["orders", "hóa đơn"],
  ["einvoices", "hóa đơn điện tử"],
  ["manualBills", "bill thêm tay"],
  ["stockDocuments", "phiếu kho"],
  ["fundTransactions", "phiếu thu/chi"],
  ["products", "mặt hàng"],
  ["categories", "danh mục"],
  ["rooms", "phòng"],
  ["prStaff", "PR/KTV"],
  ["prAttendances", "lượt điểm danh"],
  ["prSessions", "lượt PR vào phòng"],
];

function deletedSummary(log: DataPurgeLog) {
  if (!log.success) return "Không xóa gì";
  const parts = DELETED_LABELS.filter(([key]) => (log.deleted?.[key] ?? 0) > 0).map(
    ([key, label]) => `${formatNumber(log.deleted![key])} ${label}`,
  );
  return parts.length > 0 ? parts.join(", ") : "Không có dữ liệu";
}

const scopeLabel = (log: DataPurgeLog) =>
  log.scope === "ALL" ? "Toàn bộ hệ thống" : (log.branchName ?? log.branchCode ?? "—");

export default function PurgeLogsPage() {
  const {
    data: logs,
    loading,
    reload,
  } = useApiData<DataPurgeLog[]>("/admin/purge/logs", {}, [], "Không thể tải nhật ký xóa dữ liệu");

  return (
    <>
      <PageHeader
        title="Nhật ký xóa dữ liệu"
        info="Mỗi lần Hội đồng quản trị xóa dữ liệu, và mỗi lần bị từ chối vì nhập sai mật khẩu. Nhật ký không bị xóa theo dữ liệu."
        actions={
          <Button variant="outline" onClick={reload} disabled={loading}>
            <RefreshCwIcon data-icon="inline-start" className={cn(loading && "animate-spin")} />
            Tải lại
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Lịch sử</CardTitle>
          <CardDescription>500 lần gần nhất, mới nhất ở trên.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Thời gian</TableHead>
                <TableHead className={SHOW_FROM.sm}>Người thực hiện</TableHead>
                <TableHead>Phạm vi</TableHead>
                <TableHead className={SHOW_FROM.sm}>Kết quả</TableHead>
                <TableHead className={SHOW_FROM.md}>Đã xóa</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && logs.length === 0 ? (
                <TableSkeleton columns={["", SHOW_FROM.sm, "", SHOW_FROM.sm, SHOW_FROM.md]} rows={3} />
              ) : logs.length === 0 ? (
                <TableEmpty colSpan={5} icon={HistoryIcon} title="Chưa có lần xóa dữ liệu nào" />
              ) : (
                logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-normal">
                      <div className="tabular-nums">{formatDateTime(log.createdAt)}</div>
                      <div className={cn("text-xs text-muted-foreground", ONLY_NARROW)}>
                        {log.fullName} · {log.success ? "Đã xóa" : "Sai mật khẩu"}
                      </div>
                    </TableCell>
                    <TableCell className={SHOW_FROM.sm}>
                      <div className="font-medium">{log.fullName}</div>
                      <div className="text-xs text-muted-foreground">{log.username}</div>
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <div className="font-medium">{scopeLabel(log)}</div>
                      <div className={cn("text-xs text-muted-foreground", "@3xl/main:hidden")}>
                        {deletedSummary(log)}
                      </div>
                    </TableCell>
                    <TableCell className={SHOW_FROM.sm}>
                      {log.success ? (
                        <Badge variant="destructive">Đã xóa</Badge>
                      ) : (
                        <Badge variant="outline">Sai mật khẩu</Badge>
                      )}
                    </TableCell>
                    <TableCell className={cn("whitespace-normal text-muted-foreground", SHOW_FROM.md)}>
                      {deletedSummary(log)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
