"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useNotify } from "@/hooks/use-notify";
import api from "@/lib/api";
import { useBranchCode } from "@/lib/branch";
import { businessDate, firstDayOfMonth, formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { BUSINESS_DAY_HINT, DOC_TYPE_LABELS as TYPE_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/labels";
import type { StockDocType, StockDocument } from "@/lib/types";

const ALL = "ALL";

export default function StockDocumentsPage() {
  const branch = useBranchCode();
  const notify = useNotify();
  const [type, setType] = useState<StockDocType | typeof ALL>(ALL);
  const [from, setFrom] = useState(() => firstDayOfMonth());
  const [to, setTo] = useState(() => businessDate());
  const [documents, setDocuments] = useState<StockDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<StockDocument[]>("/inventory/documents", {
        params: { branch, from, to, type: type === ALL ? undefined : type },
      });
      setDocuments(res.data);
    } catch (error) {
      notify.error(error, "Không thể tải danh sách phiếu kho");
    } finally {
      setLoading(false);
    }
    // Filters apply on "Xem"; only the branch reloads automatically.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch, notify]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Phiếu kho</CardTitle>
        <p className="text-sm text-muted-foreground">{BUSINESS_DAY_HINT}</p>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <Select value={type} onValueChange={(v) => setType(v as StockDocType | typeof ALL)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Tất cả phiếu</SelectItem>
              <SelectItem value="IMPORT">Phiếu nhập</SelectItem>
              <SelectItem value="EXPORT">Phiếu xuất</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <span>Từ</span>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-[160px]" />
          </div>
          <div className="flex items-center gap-2">
            <span>Đến</span>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-[160px]" />
          </div>
          <Button onClick={load} disabled={loading}>
            {loading ? "Đang tải..." : "Xem"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mã phiếu</TableHead>
              <TableHead>Loại</TableHead>
              <TableHead>Thời gian</TableHead>
              <TableHead>Nhà cung cấp / Ghi chú</TableHead>
              <TableHead className="text-right">Số dòng</TableHead>
              <TableHead className="text-right">Tổng tiền</TableHead>
              <TableHead>Người lập</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {documents.map((doc) => (
              <TableRow
                key={doc.id}
                className={`cursor-pointer hover:bg-slate-50 ${doc.cancelledAt ? "opacity-60" : ""}`}
                onClick={() => setSelectedId(doc.id)}
              >
                <TableCell className={`font-medium ${doc.cancelledAt ? "line-through" : ""}`}>{doc.code}</TableCell>
                <TableCell className="space-x-1">
                  <Badge variant={doc.type === "IMPORT" ? "default" : "secondary"}>
                    {TYPE_LABELS[doc.type]}
                  </Badge>
                  {doc.cancelledAt && <Badge variant="outline">Đã hủy</Badge>}
                </TableCell>
                <TableCell>{formatDateTime(doc.createdAt)}</TableCell>
                <TableCell className="max-w-[260px] truncate">
                  {[doc.supplier, doc.note].filter(Boolean).join(" – ") || "—"}
                </TableCell>
                <TableCell className="text-right">{doc._count?.lines ?? 0}</TableCell>
                <TableCell className="text-right">{formatMoney(doc.totalAmount)}</TableCell>
                <TableCell>{doc.createdBy.fullName}</TableCell>
              </TableRow>
            ))}
            {documents.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  Không có phiếu nào trong khoảng thời gian này.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={selectedId !== null} onOpenChange={(open) => !open && setSelectedId(null)}>
        <DialogContent className="max-h-[80vh] max-w-3xl overflow-y-auto">
          {selectedId !== null && <DocumentDetail id={selectedId} onChanged={load} />}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function DocumentDetail({ id, onChanged }: { id: number; onChanged: () => void }) {
  const notify = useNotify();
  const [doc, setDoc] = useState<StockDocument | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get<StockDocument>(`/inventory/documents/${id}`)
      .then((res) => setDoc(res.data))
      .catch((error) => notify.error(error, "Không thể tải phiếu"));
  }, [id, notify]);

  const cancelDocument = async () => {
    if (!reason.trim()) {
      notify.error(null, "Vui lòng nhập lý do hủy");
      return;
    }
    setSaving(true);
    try {
      const res = await api.post<StockDocument>(`/inventory/documents/${id}/cancel`, { reason: reason.trim() });
      setDoc(res.data);
      setCancelling(false);
      notify.success(`Đã hủy phiếu ${res.data.code}`);
      onChanged();
    } catch (error) {
      notify.error(error, "Không thể hủy phiếu");
    } finally {
      setSaving(false);
    }
  };

  if (!doc) {
    return (
      <DialogHeader>
        <DialogTitle>Đang tải phiếu...</DialogTitle>
      </DialogHeader>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {TYPE_LABELS[doc.type]} {doc.code}
        </DialogTitle>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>Thời gian: {formatDateTime(doc.createdAt)}</div>
        <div>Người lập: {doc.createdBy.fullName}</div>
        {doc.supplier && <div>Nhà cung cấp: {doc.supplier}</div>}
        {doc.type === "IMPORT" && (
          <div>
            Thanh toán:{" "}
            {doc.fundTransaction
              ? `${PAYMENT_METHOD_LABELS[doc.fundTransaction.method]} (đã ghi phiếu chi quỹ${
                  doc.fundTransaction.cancelledAt ? ", đã hủy" : ""
                })`
              : "Chưa trả / mua nợ"}
          </div>
        )}
        {doc.note && <div className="col-span-2">Ghi chú: {doc.note}</div>}
        {doc.cancelledAt && (
          <div className="col-span-2 rounded-md border border-red-200 bg-red-50 p-2 text-red-700">
            Đã hủy lúc {formatDateTime(doc.cancelledAt)} bởi {doc.cancelledBy?.fullName ?? "—"}: {doc.cancelReason}
          </div>
        )}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Mặt hàng</TableHead>
            <TableHead>ĐVT</TableHead>
            <TableHead className="text-right">Số lượng</TableHead>
            <TableHead className="text-right">Đơn giá</TableHead>
            <TableHead className="text-right">Thành tiền</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {doc.lines?.map((line) => (
            <TableRow key={line.id}>
              <TableCell>{line.product.name}</TableCell>
              <TableCell>{line.product.unit}</TableCell>
              <TableCell className="text-right">{formatNumber(line.quantity)}</TableCell>
              <TableCell className="text-right">{formatNumber(line.unitCost)}</TableCell>
              <TableCell className="text-right">
                {formatNumber(line.quantity * Number(line.unitCost))}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="text-right text-lg font-bold">
        Tổng cộng: <span className="text-red-600">{formatMoney(doc.totalAmount)}</span>
      </div>
      {!doc.cancelledAt &&
        (cancelling ? (
          <div className="space-y-2 rounded-md border p-3">
            <DialogDescription>
              Hủy phiếu sẽ {doc.type === "IMPORT" ? "trừ lại" : "cộng lại"} số lượng vào tồn kho
              {doc.fundTransaction ? " và hủy phiếu chi quỹ đi kèm" : ""}.
            </DialogDescription>
            <Input placeholder="Lý do hủy" value={reason} onChange={(e) => setReason(e.target.value)} />
            <DialogFooter>
              <Button variant="outline" onClick={() => setCancelling(false)}>
                Đóng
              </Button>
              <Button variant="destructive" onClick={cancelDocument} disabled={saving}>
                {saving ? "Đang hủy..." : "Xác nhận hủy phiếu"}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <DialogFooter>
            <Button
              variant="outline"
              className="text-red-600"
              onClick={() => {
                setReason("");
                setCancelling(true);
              }}
            >
              Hủy phiếu
            </Button>
          </DialogFooter>
        ))}
    </>
  );
}
