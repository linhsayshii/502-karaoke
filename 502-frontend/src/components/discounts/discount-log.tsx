"use client";

import { useState } from "react";
import { BadgePercentIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ListLimitNotice, TableEmpty, TableSkeleton } from "@/components/data-states";
import { DateRangePicker, type DateRangeValue } from "@/components/date-range-picker";
import { AdjustmentDiff } from "@/components/discounts/adjustment-diff";
import { useApiData } from "@/hooks/use-api-data";
import { useBranchCode } from "@/lib/branch";
import { billLabel, businessDate, formatDateTime } from "@/lib/format";
import { ONLY_NARROW, SHOW_FROM } from "@/lib/responsive";
import type { DiscountRequestRow, DiscountRequestStatus, DiscountSource } from "@/lib/types";

const STATUS: Record<DiscountRequestStatus, { label: string; variant: "success" | "warning" | "destructive" | "secondary" }> = {
  PENDING: { label: "Chờ duyệt", variant: "warning" },
  APPROVED: { label: "Đã áp", variant: "success" },
  REJECTED: { label: "Từ chối", variant: "destructive" },
  CANCELLED: { label: "Đã hủy", variant: "secondary" },
  EXPIRED: { label: "Hết hạn", variant: "secondary" },
};
const ALL = "all";
const SOURCE: Record<DiscountSource, string> = {
  REQUEST: "Thu ngân xin",
  DIRECT: "Áp trực tiếp",
  PAID_EDIT: "Sửa hóa đơn đã thu",
};

// Every discount / VAT change of the chosen business days in the current
// branch, newest first.
export function DiscountLog() {
  const branch = useBranchCode();
  const [range, setRange] = useState<DateRangeValue>(() => ({ from: businessDate(), to: businessDate() }));
  const [status, setStatus] = useState<DiscountRequestStatus | typeof ALL>(ALL);
  const { data, total, loading } = useApiData<DiscountRequestRow[]>(
    "/discount-requests",
    { branch, ...range, status: status === ALL ? undefined : status },
    [],
    "Không thể tải nhật ký giảm giá",
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <DateRangePicker value={range} onChange={setRange} />
        <Select value={status} onValueChange={(value) => setStatus(value as DiscountRequestStatus | typeof ALL)}>
          <SelectTrigger className="w-full sm:w-48" aria-label="Lọc trạng thái">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={ALL}>Tất cả trạng thái</SelectItem>
              {(Object.keys(STATUS) as DiscountRequestStatus[]).map((key) => (
                <SelectItem key={key} value={key}>
                  {STATUS[key].label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <ListLimitNotice
        shown={data.length}
        total={total}
        noun="thay đổi"
        hint="Chọn khoảng ngày ngắn hơn để xem các thay đổi cũ hơn."
      />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Lúc</TableHead>
            <TableHead>Hóa đơn</TableHead>
            <TableHead>Thay đổi</TableHead>
            <TableHead className={SHOW_FROM.md}>Người gửi / duyệt</TableHead>
            <TableHead className={SHOW_FROM.sm}>Ghi chú</TableHead>
            <TableHead>Trạng thái</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableSkeleton columns={["", "", "", SHOW_FROM.md, SHOW_FROM.sm, ""]} />
          ) : data.length === 0 ? (
            <TableEmpty colSpan={6} icon={BadgePercentIcon} title="Không có thay đổi giảm giá trong khoảng này" />
          ) : (
            data.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="tabular-nums">{formatDateTime(r.createdAt)}</TableCell>
                <TableCell>
                  {billLabel(r.order)} · {r.order.room?.name ?? "—"}
                  <div className="text-xs text-muted-foreground">{SOURCE[r.source]}</div>
                </TableCell>
                <TableCell className="whitespace-normal">
                  <AdjustmentDiff request={r} />
                  {/* The sender and the note columns are hidden on narrower pages. */}
                  <div className="mt-1 text-xs text-muted-foreground @3xl/main:hidden">
                    {r.requestedBy?.fullName ?? "—"}
                    {r.decidedBy && r.source === "REQUEST" && ` → ${r.decidedBy.fullName}`}
                  </div>
                  {(r.note || r.decisionNote) && (
                    <div className={`text-xs text-muted-foreground ${ONLY_NARROW}`}>
                      {r.note}
                      {r.decisionNote && <div>{r.decisionNote}</div>}
                    </div>
                  )}
                </TableCell>
                <TableCell className={SHOW_FROM.md}>
                  {r.requestedBy?.fullName ?? "—"}
                  {r.decidedBy && r.source === "REQUEST" && (
                    <div className="text-xs text-muted-foreground">→ {r.decidedBy.fullName}</div>
                  )}
                </TableCell>
                <TableCell className={`${SHOW_FROM.sm} whitespace-normal`}>
                  {r.note}
                  {r.decisionNote && <div className="text-xs text-muted-foreground">{r.decisionNote}</div>}
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS[r.status].variant}>{STATUS[r.status].label}</Badge>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
