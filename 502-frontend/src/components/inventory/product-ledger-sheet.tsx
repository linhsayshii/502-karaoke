"use client";

import { useEffect, useState } from "react";
import { HistoryIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ListLimitNotice, TableEmpty, TableSkeleton } from "@/components/data-states";
import { useNotify } from "@/hooks/use-notify";
import api, { totalCountOf } from "@/lib/api";
import { billLabel, formatDateTime, formatNumber } from "@/lib/format";
import { DOC_TYPE_LABELS, MOVEMENT_LABELS } from "@/lib/labels";
import type { StockMovement, StockMovementType } from "@/lib/types";
import { cn } from "@/lib/utils";

const MOVEMENT_BADGE: Record<StockMovementType, "default" | "secondary" | "outline" | "destructive"> = {
  IMPORT: "default",
  EXPORT: "secondary",
  SALE: "outline",
  ADJUSTMENT: "secondary",
  REVERSAL: "destructive",
};

export interface LedgerProduct {
  id: number;
  name: string;
  unit: string;
  // The product's branch (the chain manager may list several).
  branch: string;
}

// Sổ kho of one product: every change of its stock, newest first.
export function ProductLedgerSheet({
  product,
  onOpenChange,
}: {
  product: LedgerProduct | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={!!product} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 sm:max-w-2xl">
        <SheetHeader className="border-b">
          <SheetTitle>Sổ kho – {product?.name}</SheetTitle>
          <SheetDescription>
            Mỗi dòng là một lần tồn kho thay đổi ({product?.unit}); cột &quot;Tồn sau&quot; là tồn kho ngay sau lần
            đó, dòng trên cùng là tồn hiện tại.
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-4">
          {product && <MovementHistory key={`${product.branch}-${product.id}`} product={product} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function MovementHistory({ product }: { product: LedgerProduct }) {
  const notify = useNotify();
  const [movements, setMovements] = useState<StockMovement[] | null>(null);
  // How many movements the product has in all; the list holds the newest 500.
  const [total, setTotal] = useState<number | null>(null);

  useEffect(() => {
    api
      .get<StockMovement[]>("/inventory/movements", { params: { branch: product.branch, productId: product.id } })
      .then((res) => {
        setMovements(res.data);
        setTotal(totalCountOf(res));
      })
      .catch((error) => {
        notify.error(error, "Không thể tải sổ kho");
        setMovements([]);
      });
  }, [product.branch, product.id, notify]);

  const source = (m: StockMovement) =>
    m.document ? `${DOC_TYPE_LABELS[m.document.type]} ${m.document.code}` : m.order ? `Hóa đơn ${billLabel(m.order)}` : "—";

  return (
    <>
      {movements && (
        <ListLimitNotice
          shown={movements.length}
          total={total}
          noun="lần thay đổi"
          className="mb-4"
          hint="Các lần cũ hơn vẫn nằm trong sổ kho; xem theo kỳ ở báo cáo Tồn kho hoặc Xuất nhập tồn."
        />
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Thời gian</TableHead>
            <TableHead>Loại</TableHead>
            <TableHead className="hidden sm:table-cell">Chứng từ</TableHead>
            <TableHead className="text-right">Số lượng</TableHead>
            <TableHead className="text-right">Tồn sau</TableHead>
            <TableHead className="hidden sm:table-cell">Người thực hiện</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {!movements ? (
            <TableSkeleton columns={["", "", "hidden sm:table-cell", "", "", "hidden sm:table-cell"]} rows={4} />
          ) : movements.length === 0 ? (
            <TableEmpty colSpan={6} icon={HistoryIcon} title="Chưa có biến động kho" />
          ) : (
            movements.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="whitespace-normal tabular-nums">{formatDateTime(m.createdAt)}</TableCell>
                <TableCell>
                  <Badge variant={MOVEMENT_BADGE[m.type]}>{MOVEMENT_LABELS[m.type]}</Badge>
                </TableCell>
                <TableCell className="hidden max-w-44 truncate sm:table-cell">{source(m)}</TableCell>
                <TableCell className={cn("text-right font-medium tabular-nums", m.quantity < 0 && "text-destructive")}>
                  {m.quantity > 0 ? "+" : ""}
                  {formatNumber(m.quantity)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(m.balanceAfter)}</TableCell>
                <TableCell className="hidden sm:table-cell">{m.createdBy?.fullName ?? "—"}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </>
  );
}
