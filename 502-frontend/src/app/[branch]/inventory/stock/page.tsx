"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BoxesIcon, HistoryIcon, PackageMinusIcon, PackagePlusIcon, SearchIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TableEmpty, TableSkeleton } from "@/components/data-states";
import { ExportExcelButton } from "@/components/export-excel-button";
import { useAuth } from "@/components/auth-provider";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/layout/page-header";
import { useApiData } from "@/hooks/use-api-data";
import { useNotify } from "@/hooks/use-notify";
import api from "@/lib/api";
import { useBranchCode } from "@/lib/branch";
import { exportWorkbook, toSheet, type ExportColumn } from "@/lib/excel-export";
import { businessDate, formatAmount, formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { DOC_TYPE_LABELS, MOVEMENT_LABELS } from "@/lib/labels";
import { SHOW_FROM } from "@/lib/responsive";
import type { Product, StockMovement, StockMovementType } from "@/lib/types";
import { cn } from "@/lib/utils";

const ALL = "all";
const OUT = "out";
const NO_CATEGORY = "none";

const MOVEMENT_BADGE: Record<StockMovementType, "default" | "secondary" | "outline" | "destructive"> = {
  IMPORT: "default",
  EXPORT: "secondary",
  SALE: "outline",
  ADJUSTMENT: "secondary",
  REVERSAL: "destructive",
};

const stockColumns: ExportColumn<Product>[] = [
  { header: "Mặt hàng", value: (p) => p.name },
  { header: "Danh mục", value: (p) => p.category?.name ?? "Chưa phân loại" },
  { header: "ĐVT", value: (p) => p.unit },
  { header: "Tồn kho", type: "number", value: (p) => p.stockQuantity },
  { header: "Đang phục vụ", type: "number", value: (p) => p.pendingQuantity ?? 0 },
  { header: "Khả dụng", type: "number", value: (p) => p.availableQuantity ?? p.stockQuantity },
  { header: "Giá vốn", type: "money", value: (p) => Number(p.costPrice) },
  { header: "Giá trị tồn", type: "money", value: (p) => Math.max(0, p.stockQuantity) * Number(p.costPrice) },
  { header: "Trạng thái", value: (p) => (p.active ? "Đang bán" : "Ngừng bán") },
];

function StatTile({ label, value, footer }: { label: string; value: string; footer: string }) {
  return (
    <Card className="gap-2">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl font-semibold">{value}</CardTitle>
      </CardHeader>
      <CardFooter className="text-sm text-muted-foreground">{footer}</CardFooter>
    </Card>
  );
}

// Stock of the branch: on hand (after paid bills), still to be served in open
// rooms, and what is really available.
export default function StockPage() {
  const branch = useBranchCode();
  const { user } = useAuth();
  const canWrite = can(user, "inventory");
  const { data: list, loading } = useApiData<Product[]>("/inventory/stock", { branch }, [], "Không thể tải tồn kho");
  const products = loading && list.length === 0 ? null : list;
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(ALL);
  const [view, setView] = useState(ALL);
  const [historyOf, setHistoryOf] = useState<Product | null>(null);

  const categories = useMemo(() => {
    const names = new Map<string, string>();
    for (const p of list) if (p.category) names.set(String(p.category.id), p.category.name);
    return [...names].sort(([, a], [, b]) => a.localeCompare(b, "vi"));
  }, [list]);

  const keyword = search.trim().toLowerCase();
  const shown = list.filter(
    (p) =>
      p.name.toLowerCase().includes(keyword) &&
      (category === ALL || (category === NO_CATEGORY ? !p.categoryId : String(p.categoryId) === category)) &&
      (view === ALL || (p.availableQuantity ?? p.stockQuantity) <= 0),
  );

  const value = list.reduce((sum, p) => sum + Math.max(0, p.stockQuantity) * Number(p.costPrice), 0);
  const outOfStock = list.filter((p) => (p.availableQuantity ?? p.stockQuantity) <= 0).length;
  const pendingUnits = list.reduce((sum, p) => sum + (p.pendingQuantity ?? 0), 0);

  // The list as filtered on screen.
  const exportExcel = () =>
    exportWorkbook(`ton-kho_${branch}_${businessDate()}.xlsx`, [toSheet("Tồn kho", stockColumns, shown)]);

  return (
    <>
      <PageHeader
        title="Tồn kho"
        info="Tồn kho trừ khi hóa đơn được thanh toán; phần đã gọi trong phòng đang mở hiện ở cột Đang phục vụ."
        actions={
          <>
            <ExportExcelButton onExport={products && shown.length > 0 ? exportExcel : undefined} />
            {canWrite && (
              <>
                <Button variant="outline" asChild>
                  <Link href={`/${branch}/inventory/export`}>
                    <PackageMinusIcon data-icon="inline-start" />
                    Xuất hàng
                  </Link>
                </Button>
                <Button asChild>
                  <Link href={`/${branch}/inventory/import`}>
                    <PackagePlusIcon data-icon="inline-start" />
                    Nhập hàng
                  </Link>
                </Button>
              </>
            )}
          </>
        }
      />

      {!products ? (
        <div className="grid gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
          <StatTile
            label="Mặt hàng quản lý tồn"
            value={formatNumber(list.length)}
            footer={`${categories.length} danh mục`}
          />
          <StatTile label="Giá trị tồn kho" value={formatMoney(value)} footer="Tồn kho × giá vốn (lần nhập gần nhất)" />
          <StatTile
            label="Đang phục vụ"
            value={formatNumber(pendingUnits)}
            footer="Đơn vị đã gọi trong phòng đang mở"
          />
          <StatTile label="Hết hàng" value={formatNumber(outOfStock)} footer="Mặt hàng không còn khả dụng" />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Danh sách tồn kho</CardTitle>
          <CardDescription>Bấm vào một mặt hàng để xem sổ kho (nhập, xuất, bán) của nó.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <InputGroup className="md:max-w-64">
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
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="md:w-48" aria-label="Danh mục">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value={ALL}>Tất cả danh mục</SelectItem>
                  {categories.map(([id, name]) => (
                    <SelectItem key={id} value={id}>
                      {name}
                    </SelectItem>
                  ))}
                  <SelectItem value={NO_CATEGORY}>Chưa phân loại</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={view}
              onValueChange={(v) => v && setView(v)}
              className="md:ml-auto"
              aria-label="Lọc tồn kho"
            >
              <ToggleGroupItem value={ALL}>Tất cả</ToggleGroupItem>
              <ToggleGroupItem value={OUT}>Hết hàng · {outOfStock}</ToggleGroupItem>
            </ToggleGroup>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mặt hàng</TableHead>
                <TableHead className={SHOW_FROM.md}>Danh mục</TableHead>
                <TableHead className={SHOW_FROM.sm}>ĐVT</TableHead>
                <TableHead className="text-right">Tồn kho</TableHead>
                <TableHead className={cn("text-right", SHOW_FROM.sm)}>Đang phục vụ</TableHead>
                <TableHead className="text-right">Khả dụng</TableHead>
                <TableHead className={cn("text-right", SHOW_FROM.lg)}>Giá vốn</TableHead>
                <TableHead className={cn("text-right", SHOW_FROM.md)}>Giá trị tồn</TableHead>
                <TableHead className={cn("w-12", SHOW_FROM.xs)} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {!products ? (
                <TableSkeleton
                  columns={[
                    "",
                    SHOW_FROM.md,
                    SHOW_FROM.sm,
                    "",
                    SHOW_FROM.sm,
                    "",
                    SHOW_FROM.lg,
                    SHOW_FROM.md,
                    SHOW_FROM.xs,
                  ]}
                />
              ) : shown.length === 0 ? (
                <TableEmpty
                  colSpan={9}
                  icon={BoxesIcon}
                  title={list.length === 0 ? "Chưa có mặt hàng quản lý tồn" : "Không có mặt hàng phù hợp"}
                  description={
                    list.length === 0 ? "Thêm mặt hàng trong Danh mục hàng rồi lập phiếu nhập." : "Thử bộ lọc khác."
                  }
                />
              ) : (
                shown.map((product) => {
                  const available = product.availableQuantity ?? product.stockQuantity;
                  return (
                    <TableRow key={product.id} className="cursor-pointer" onClick={() => setHistoryOf(product)}>
                      <TableCell className="font-medium whitespace-normal">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          {product.name}
                          {!product.active && <Badge variant="outline">Ngừng bán</Badge>}
                        </span>
                      </TableCell>
                      <TableCell className={SHOW_FROM.md}>{product.category?.name ?? "Chưa phân loại"}</TableCell>
                      <TableCell className={SHOW_FROM.sm}>{product.unit}</TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-medium tabular-nums",
                          product.stockQuantity < 0 && "text-destructive",
                        )}
                      >
                        {product.stockQuantity < 0 ? (
                          <Tooltip>
                            <TooltipTrigger className="cursor-help underline decoration-dotted">
                              {formatNumber(product.stockQuantity)}
                            </TooltipTrigger>
                            <TooltipContent>Bán vượt tồn — hãy lập phiếu nhập bổ sung</TooltipContent>
                          </Tooltip>
                        ) : (
                          formatNumber(product.stockQuantity)
                        )}
                      </TableCell>
                      <TableCell className={cn("text-right text-muted-foreground tabular-nums", SHOW_FROM.sm)}>
                        {product.pendingQuantity ? formatNumber(product.pendingQuantity) : "—"}
                      </TableCell>
                      <TableCell className={cn("text-right tabular-nums", available <= 0 && "text-destructive")}>
                        {formatNumber(available)}
                      </TableCell>
                      <TableCell className={cn("text-right tabular-nums", SHOW_FROM.lg)}>
                        {formatAmount(Number(product.costPrice))}
                      </TableCell>
                      <TableCell className={cn("text-right tabular-nums", SHOW_FROM.md)}>
                        {formatAmount(Math.max(0, product.stockQuantity) * Number(product.costPrice))}
                      </TableCell>
                      <TableCell className={SHOW_FROM.xs}>
                        {/* The click reaches the row, which opens the ledger. */}
                        <Button variant="ghost" size="icon-sm" aria-label={`Sổ kho ${product.name}`}>
                          <HistoryIcon />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Sheet open={!!historyOf} onOpenChange={(open) => !open && setHistoryOf(null)}>
        <SheetContent className="w-full gap-0 sm:max-w-2xl">
          <SheetHeader className="border-b">
            <SheetTitle>Sổ kho – {historyOf?.name}</SheetTitle>
            <SheetDescription>
              Tồn hiện tại {formatNumber(historyOf?.stockQuantity)} {historyOf?.unit}. Mỗi dòng là một lần tồn kho thay
              đổi; cột &quot;Tồn sau&quot; luôn khớp với tồn kho.
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto p-4">
            {historyOf && <MovementHistory branch={branch} productId={historyOf.id} />}
          </div>
        </SheetContent>
      </Sheet>
    </>
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
        notify.error(error, "Không thể tải sổ kho");
        setMovements([]);
      });
  }, [branch, productId, notify]);

  const source = (m: StockMovement) =>
    m.document ? `${DOC_TYPE_LABELS[m.document.type]} ${m.document.code}` : m.orderId ? `Hóa đơn #${m.orderId}` : "—";

  return (
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
  );
}
