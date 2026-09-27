"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BanknoteIcon, HandCoinsIcon, LandmarkIcon, PlusIcon, SaveIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ExcelImportButton } from "@/components/excel-import/import-button";
import { PageHeader } from "@/components/layout/page-header";
import { useNotify } from "@/hooks/use-notify";
import api from "@/lib/api";
import { useBranchCode } from "@/lib/branch";
import { formatMoney, formatNumber } from "@/lib/format";
import { PAYMENT_METHOD_LABELS } from "@/lib/labels";
import type { PaymentMethod, Product, StockDocType, StockDocument } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Line {
  key: number;
  productId: string;
  quantity: string;
  unitCost: string;
}

// How an import is paid: from the fund (writes a phiếu chi) or on credit.
const UNPAID = "UNPAID";
type Payment = PaymentMethod | typeof UNPAID;

// One row per line on a wide card; on a narrow one the product goes on top,
// then quantity and price, then stock and amount.
const LINE_GRID =
  "grid-cols-2 gap-x-3 gap-y-2 @2xl/lines:grid-cols-[minmax(0,1fr)_4rem_6rem_9rem_7rem_2rem] @2xl/lines:items-center";

let nextKey = 1;
const emptyLine = (): Line => ({ key: nextKey++, productId: "", quantity: "1", unitCost: "" });

// Phiếu nhập / phiếu xuất: saved in one request, stock (and the fund payment
// of a paid import) change atomically on the server. Export lines are valued
// at the current cost price.
export function StockDocumentForm({ type }: { type: StockDocType }) {
  const isImport = type === "IMPORT";
  const costLabel = isImport ? "Đơn giá nhập" : "Giá vốn";
  const branch = useBranchCode();
  const router = useRouter();
  const notify = useNotify();
  const [products, setProducts] = useState<Product[]>([]);
  const [lines, setLines] = useState<Line[]>(() => [emptyLine()]);
  const [supplier, setSupplier] = useState("");
  const [note, setNote] = useState("");
  const [payment, setPayment] = useState<Payment>("CASH");
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadProducts = useCallback(async () => {
    try {
      const res = await api.get<Product[]>("/inventory/stock", { params: { branch } });
      setProducts(res.data);
    } catch (error) {
      notify.error(error, "Không thể tải danh sách mặt hàng");
    }
  }, [branch, notify]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const byId = useMemo(() => new Map(products.map((p) => [String(p.id), p])), [products]);
  // Discontinued products can still be exported (to clear what is left).
  const grouped = useMemo(() => {
    const groups = new Map<string, Product[]>();
    for (const p of products) {
      if (isImport && !p.active) continue;
      const name = p.category?.name ?? "Chưa phân loại";
      groups.set(name, [...(groups.get(name) ?? []), p]);
    }
    return [...groups].sort(([a], [b]) => a.localeCompare(b, "vi"));
  }, [products, isImport]);

  const updateLine = (key: number, patch: Partial<Line>) =>
    setLines((current) => current.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const selectProduct = (key: number, productId: string) => {
    const product = byId.get(productId);
    // Suggest the last cost price for imports.
    updateLine(key, {
      productId,
      ...(isImport && product ? { unitCost: Number(product.costPrice) ? String(Number(product.costPrice)) : "" } : {}),
    });
  };

  const quantityOf = (line: Line) => Number(line.quantity);
  const badQuantity = (line: Line) => !Number.isInteger(quantityOf(line)) || quantityOf(line) < 1;
  const lineCost = (line: Line) => {
    const cost = isImport ? Number(line.unitCost) : Number(byId.get(line.productId)?.costPrice ?? 0);
    return (quantityOf(line) || 0) * (cost || 0);
  };
  const filled = lines.filter((l) => l.productId);
  const total = filled.reduce((sum, l) => sum + lineCost(l), 0);
  const usedIds = new Set(lines.map((l) => l.productId));

  const save = async () => {
    setSubmitted(true);
    if (filled.length === 0) {
      notify.error(null, "Vui lòng chọn ít nhất một mặt hàng");
      return;
    }
    if (filled.some(badQuantity)) {
      notify.error(null, "Số lượng phải là số nguyên lớn hơn 0");
      return;
    }
    setSaving(true);
    try {
      const res = await api.post<StockDocument>(
        "/inventory/documents",
        {
          type,
          supplier: isImport && supplier.trim() ? supplier.trim() : undefined,
          note: note.trim() || undefined,
          paymentMethod: isImport && payment !== UNPAID ? payment : undefined,
          lines: filled.map((l) => ({
            productId: Number(l.productId),
            quantity: quantityOf(l),
            unitCost: isImport && l.unitCost !== "" ? Number(l.unitCost) : undefined,
          })),
        },
        { params: { branch } },
      );
      toast.success(`Đã lưu phiếu ${res.data.code}`, {
        description: res.data.fundTransaction
          ? `Đã ghi phiếu chi ${formatMoney(res.data.totalAmount)} vào sổ quỹ.`
          : "Tồn kho đã được cập nhật.",
        action: { label: "Xem phiếu", onClick: () => router.push(`/${branch}/inventory/documents`) },
      });
      setLines([emptyLine()]);
      setSupplier("");
      setNote("");
      setSubmitted(false);
      loadProducts();
    } catch (error) {
      notify.error(error, `Không thể lưu phiếu ${isImport ? "nhập" : "xuất"}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        title={isImport ? "Nhập hàng" : "Xuất hàng"}
        description={
          isImport
            ? "Nhập hàng vào kho; đơn giá nhập trở thành giá vốn của mặt hàng. Nếu đã trả tiền, phiếu chi được ghi vào sổ quỹ."
            : "Xuất hủy, dùng nội bộ, trả nhà cung cấp… Không xuất quá số tồn kho."
        }
        actions={isImport && <ExcelImportButton type="stock-import" />}
      />

      <div className="grid items-start gap-4 md:gap-6 @4xl/main:grid-cols-[minmax(0,1fr)_22rem]">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Hàng hóa</CardTitle>
            <CardDescription>Mỗi mặt hàng một dòng.</CardDescription>
          </CardHeader>
          <CardContent className="@container/lines">
            <div className={cn(LINE_GRID, "hidden border-b pb-2 text-sm font-medium @2xl/lines:grid")}>
              <span>Mặt hàng</span>
              <span className="text-right">Tồn</span>
              <span>Số lượng</span>
              <span>{costLabel}</span>
              <span className="text-right">Thành tiền</span>
              <span className="sr-only">Xóa dòng</span>
            </div>
            {lines.map((line) => {
              const product = byId.get(line.productId);
              const invalidQuantity = submitted && !!line.productId && badQuantity(line);
              const removeButton = (className: string) => (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Xóa dòng"
                  className={className}
                  disabled={lines.length === 1}
                  onClick={() => setLines((current) => current.filter((l) => l.key !== line.key))}
                >
                  <Trash2Icon />
                </Button>
              );
              return (
                <div
                  key={line.key}
                  className={cn(LINE_GRID, "grid border-b py-3 text-sm last:border-b-0 @2xl/lines:py-2")}
                >
                  <div className="col-span-2 flex items-center gap-2 @2xl/lines:col-span-1">
                    <Select value={line.productId} onValueChange={(v) => selectProduct(line.key, v)}>
                      <SelectTrigger className="min-w-0 flex-1" aria-label="Mặt hàng">
                        <SelectValue placeholder="Chọn mặt hàng" />
                      </SelectTrigger>
                      <SelectContent>
                        {grouped.map(([categoryName, items]) => (
                          <SelectGroup key={categoryName}>
                            <SelectLabel>{categoryName}</SelectLabel>
                            {items.map((p) => (
                              <SelectItem
                                key={p.id}
                                value={String(p.id)}
                                disabled={usedIds.has(String(p.id)) && line.productId !== String(p.id)}
                              >
                                {p.name} ({p.unit})
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        ))}
                      </SelectContent>
                    </Select>
                    {removeButton("@2xl/lines:hidden")}
                  </div>
                  <div
                    className={cn(
                      "row-start-3 self-center tabular-nums @2xl/lines:row-start-auto @2xl/lines:text-right",
                      product && product.stockQuantity <= 0 && "text-destructive",
                    )}
                  >
                    <span className="text-muted-foreground @2xl/lines:hidden">Tồn kho: </span>
                    {product ? `${formatNumber(product.stockQuantity)}` : "—"}
                  </div>
                  <Field data-invalid={invalidQuantity || undefined} className="gap-1.5">
                    <FieldLabel htmlFor={`quantity-${line.key}`} className="@2xl/lines:hidden">
                      Số lượng
                    </FieldLabel>
                    <Input
                      id={`quantity-${line.key}`}
                      aria-label="Số lượng"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      step={1}
                      aria-invalid={invalidQuantity || undefined}
                      className="text-right tabular-nums"
                      value={line.quantity}
                      onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                    />
                  </Field>
                  <Field className="gap-1.5">
                    <FieldLabel htmlFor={`cost-${line.key}`} className="@2xl/lines:hidden">
                      {costLabel}
                    </FieldLabel>
                    {isImport ? (
                      <InputGroup>
                        <InputGroupInput
                          id={`cost-${line.key}`}
                          aria-label={costLabel}
                          type="number"
                          inputMode="numeric"
                          min={0}
                          className="text-right tabular-nums"
                          value={line.unitCost}
                          onChange={(e) => updateLine(line.key, { unitCost: e.target.value })}
                        />
                        <InputGroupAddon align="inline-end">
                          <InputGroupText>đ</InputGroupText>
                        </InputGroupAddon>
                      </InputGroup>
                    ) : (
                      <span id={`cost-${line.key}`} className="flex h-9 items-center tabular-nums">
                        {product ? formatNumber(product.costPrice) : "—"}
                      </span>
                    )}
                  </Field>
                  <div className="self-center text-right font-medium tabular-nums">
                    <span className="font-normal text-muted-foreground @2xl/lines:hidden">Thành tiền: </span>
                    {formatNumber(lineCost(line))}
                  </div>
                  {removeButton("hidden @2xl/lines:inline-flex")}
                </div>
              );
            })}
          </CardContent>
          <CardFooter>
            <Button variant="outline" onClick={() => setLines((current) => [...current, emptyLine()])}>
              <PlusIcon data-icon="inline-start" />
              Thêm dòng
            </Button>
          </CardFooter>
        </Card>

        <Card className="@4xl/main:sticky @4xl/main:top-4">
          <CardHeader>
            <CardTitle>Thông tin phiếu</CardTitle>
            <CardDescription>Mã phiếu được tạo khi lưu (PN-/PX-…).</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              {isImport && (
                <Field>
                  <FieldLabel htmlFor="doc-supplier">Nhà cung cấp</FieldLabel>
                  <Input id="doc-supplier" value={supplier} onChange={(e) => setSupplier(e.target.value)} />
                </Field>
              )}
              {isImport && (
                <Field>
                  <FieldLabel>Thanh toán</FieldLabel>
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    size="sm"
                    value={payment}
                    onValueChange={(v) => v && setPayment(v as Payment)}
                    className="w-full"
                    aria-label="Thanh toán cho nhà cung cấp"
                  >
                    <ToggleGroupItem value="CASH" className="flex-1">
                      <BanknoteIcon />
                      {PAYMENT_METHOD_LABELS.CASH}
                    </ToggleGroupItem>
                    <ToggleGroupItem value="TRANSFER" className="flex-1">
                      <LandmarkIcon />
                      CK
                    </ToggleGroupItem>
                    <ToggleGroupItem value={UNPAID} className="flex-1">
                      <HandCoinsIcon />
                      Chưa trả
                    </ToggleGroupItem>
                  </ToggleGroup>
                  <FieldDescription>
                    {payment === UNPAID
                      ? "Mua nợ: không ghi sổ quỹ. Khi trả tiền, lập phiếu chi trong Sổ quỹ."
                      : `Ghi phiếu chi ${PAYMENT_METHOD_LABELS[payment].toLowerCase()} vào sổ quỹ cùng lúc lưu phiếu.`}
                  </FieldDescription>
                </Field>
              )}
              <Field>
                <FieldLabel htmlFor="doc-note">{isImport ? "Ghi chú" : "Lý do xuất"}</FieldLabel>
                <Textarea
                  id="doc-note"
                  placeholder={isImport ? "" : "VD: hàng hư hỏng, dùng nội bộ"}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </Field>
            </FieldGroup>
          </CardContent>
          <Separator />
          <CardFooter className="flex-col items-stretch gap-4">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted-foreground">Tổng cộng ({filled.length} mặt hàng)</span>
              <span className="text-2xl font-semibold">{formatMoney(total)}</span>
            </div>
            <Button size="lg" onClick={save} disabled={saving}>
              {saving ? <Spinner data-icon="inline-start" /> : <SaveIcon data-icon="inline-start" />}
              Lưu phiếu {isImport ? "nhập" : "xuất"}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </>
  );
}
