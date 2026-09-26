"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { History } from "lucide-react";
import { useNotify } from "@/hooks/use-notify";
import api from "@/lib/api";
import { useBranchCode } from "@/lib/branch";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { DOC_TYPE_LABELS, MOVEMENT_LABELS } from "@/lib/labels";
import type { Product, StockMovement } from "@/lib/types";


export default function StockPage() {
  const branch = useBranchCode();
  const notify = useNotify();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyOf, setHistoryOf] = useState<Product | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get<Product[]>("/inventory/stock", { params: { branch } });
      setProducts(res.data);
    } catch (error) {
      notify.error(error, "Không thể tải tồn kho");
    } finally {
      setLoading(false);
    }
  }, [branch, notify]);

  useEffect(() => {
    load();
  }, [load]);

  const grouped = products.reduce<Record<string, Product[]>>((acc, product) => {
    const category = product.category?.name ?? "Chưa phân loại";
    (acc[category] ??= []).push(product);
    return acc;
  }, {});
  const totalValue = products.reduce(
    (sum, p) => sum + Math.max(0, p.stockQuantity) * Number(p.costPrice),
    0,
  );

  if (loading) return <div>Đang tải...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">Tồn kho</h2>
        <div className="text-sm text-muted-foreground">
          Giá trị tồn (tồn kho × giá vốn):{" "}
          <span className="font-bold text-foreground">{formatMoney(totalValue)}</span>
        </div>
      </div>

      {products.length === 0 && (
        <p className="py-12 text-center text-muted-foreground">
          Chưa có mặt hàng nào quản lý tồn kho.
        </p>
      )}

      {Object.entries(grouped).map(([category, items]) => (
        <Card key={category}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Badge variant="secondary" className="px-3 py-1 text-base">
                {category}
              </Badge>
              <span className="text-sm font-normal text-muted-foreground">
                ({items.length} mặt hàng)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">STT</TableHead>
                  <TableHead>Mã hàng</TableHead>
                  <TableHead>Tên mặt hàng</TableHead>
                  <TableHead>ĐVT</TableHead>
                  <TableHead className="text-right">Tồn kho</TableHead>
                  <TableHead className="text-right" title="Đã gọi trong các phòng đang mở, trừ kho khi thanh toán">
                    Đang phục vụ
                  </TableHead>
                  <TableHead className="text-right">Khả dụng</TableHead>
                  <TableHead className="text-right">Giá vốn</TableHead>
                  <TableHead className="text-right">Giá bán</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((product, index) => (
                  <TableRow key={product.id}>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell>SP{product.id}</TableCell>
                    <TableCell className="font-medium">
                      {product.name}
                      {!product.active && (
                        <Badge variant="outline" className="ml-2">
                          Ngừng bán
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{product.unit}</TableCell>
                    <TableCell
                      className={`text-right font-medium ${product.stockQuantity <= 0 ? "text-red-600" : ""}`}
                    >
                      {formatNumber(product.stockQuantity)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {product.pendingQuantity ? formatNumber(product.pendingQuantity) : "—"}
                    </TableCell>
                    <TableCell
                      className={`text-right ${(product.availableQuantity ?? 0) <= 0 ? "text-red-600" : ""}`}
                    >
                      {formatNumber(product.availableQuantity)}
                    </TableCell>
                    <TableCell className="text-right">{formatNumber(product.costPrice)}</TableCell>
                    <TableCell className="text-right">{formatNumber(product.price)}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Lịch sử xuất nhập"
                        onClick={() => setHistoryOf(product)}
                      >
                        <History className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}

      <Dialog open={!!historyOf} onOpenChange={(open) => !open && setHistoryOf(null)}>
        <DialogContent className="max-h-[80vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Lịch sử xuất nhập – {historyOf?.name}</DialogTitle>
          </DialogHeader>
          {historyOf && <MovementHistory branch={branch} productId={historyOf.id} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MovementHistory({ branch, productId }: { branch: string; productId: number }) {
  const notify = useNotify();
  const [movements, setMovements] = useState<StockMovement[] | null>(null);

  useEffect(() => {
    api
      .get<StockMovement[]>("/inventory/movements", { params: { branch, productId } })
      .then((res) => setMovements(res.data))
      .catch((error) => {
        notify.error(error, "Không thể tải lịch sử kho");
        setMovements([]);
      });
  }, [branch, productId, notify]);

  if (!movements) return <div>Đang tải...</div>;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Thời gian</TableHead>
          <TableHead>Loại</TableHead>
          <TableHead>Chứng từ</TableHead>
          <TableHead className="text-right">Số lượng</TableHead>
          <TableHead className="text-right">Tồn sau</TableHead>
          <TableHead>Người thực hiện</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {movements.map((m) => (
          <TableRow key={m.id}>
            <TableCell>{formatDateTime(m.createdAt)}</TableCell>
            <TableCell>{MOVEMENT_LABELS[m.type]}</TableCell>
            <TableCell>
              {m.document
                ? `${DOC_TYPE_LABELS[m.document.type]} ${m.document.code}`
                : m.orderId
                  ? `Hóa đơn #${m.orderId}`
                  : "—"}
            </TableCell>
            <TableCell className={`text-right ${m.quantity < 0 ? "text-red-600" : "text-green-600"}`}>
              {m.quantity > 0 ? "+" : ""}
              {formatNumber(m.quantity)}
            </TableCell>
            <TableCell className="text-right">{formatNumber(m.balanceAfter)}</TableCell>
            <TableCell>{m.createdBy?.fullName ?? "—"}</TableCell>
          </TableRow>
        ))}
        {movements.length === 0 && (
          <TableRow>
            <TableCell colSpan={6} className="text-center text-muted-foreground">
              Chưa có biến động kho.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
