"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, Plus, Save } from "lucide-react";
import { useNotify } from "@/hooks/use-notify";
import api from "@/lib/api";
import { useBranchCode } from "@/lib/branch";
import { formatMoney, formatNumber } from "@/lib/format";
import type { Product, StockDocType, StockDocument } from "@/lib/types";

interface Line {
  key: number;
  productId: string;
  quantity: string;
  unitCost: string;
}

let nextKey = 1;
const emptyLine = (): Line => ({ key: nextKey++, productId: "", quantity: "1", unitCost: "" });

// Phiếu nhập / phiếu xuất: saved in one request, stock changes atomically
// on the server. Export lines are valued at the current cost price.
export function StockDocumentForm({ type }: { type: StockDocType }) {
  const isImport = type === "IMPORT";
  const branch = useBranchCode();
  const notify = useNotify();
  const [products, setProducts] = useState<Product[]>([]);
  const [lines, setLines] = useState<Line[]>(() => [emptyLine()]);
  const [supplier, setSupplier] = useState("");
  const [note, setNote] = useState("");
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

  const byId = new Map(products.map((p) => [String(p.id), p]));
  const grouped = products.reduce<Record<string, Product[]>>((acc, p) => {
    (acc[p.category?.name ?? "Chưa phân loại"] ??= []).push(p);
    return acc;
  }, {});

  const updateLine = (key: number, patch: Partial<Line>) =>
    setLines((current) => current.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const selectProduct = (key: number, productId: string) => {
    const product = byId.get(productId);
    updateLine(key, {
      productId,
      // Suggest the last cost price for imports.
      ...(isImport && product ? { unitCost: String(Number(product.costPrice) || "") } : {}),
    });
  };

  const lineCost = (line: Line) => {
    const cost = isImport ? Number(line.unitCost) : Number(byId.get(line.productId)?.costPrice ?? 0);
    return (Number(line.quantity) || 0) * (cost || 0);
  };
  const total = lines.reduce((sum, l) => sum + lineCost(l), 0);

  const save = async () => {
    const filled = lines.filter((l) => l.productId);
    if (filled.length === 0) {
      notify.error(null, "Vui lòng chọn ít nhất một mặt hàng");
      return;
    }
    if (filled.some((l) => !Number.isInteger(Number(l.quantity)) || Number(l.quantity) < 1)) {
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
          lines: filled.map((l) => ({
            productId: Number(l.productId),
            quantity: Number(l.quantity),
            unitCost: isImport && l.unitCost !== "" ? Number(l.unitCost) : undefined,
          })),
        },
        { params: { branch } },
      );
      notify.success(`Đã lưu phiếu ${res.data.code}`);
      setLines([emptyLine()]);
      setSupplier("");
      setNote("");
      loadProducts();
    } catch (error) {
      notify.error(error, `Không thể lưu phiếu ${isImport ? "nhập" : "xuất"}`);
    } finally {
      setSaving(false);
    }
  };

  const usedIds = new Set(lines.map((l) => l.productId));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>{isImport ? "Phiếu nhập hàng" : "Phiếu xuất hàng"}</CardTitle>
          <CardDescription>
            {isImport
              ? "Nhập hàng vào kho; giá nhập sẽ cập nhật giá vốn của mặt hàng."
              : "Xuất hủy, xuất dùng nội bộ, trả hàng... Không xuất quá số tồn."}
          </CardDescription>
        </div>
        <Button onClick={save} disabled={saving} className="bg-green-600 hover:bg-green-700">
          <Save className="mr-2 h-4 w-4" /> {saving ? "Đang lưu..." : `Lưu phiếu ${isImport ? "nhập" : "xuất"}`}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          {isImport && (
            <div className="space-y-1.5">
              <Label>Nhà cung cấp</Label>
              <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Ghi chú</Label>
            <Textarea
              rows={1}
              value={note}
              placeholder={isImport ? "" : "Lý do xuất"}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]">STT</TableHead>
              <TableHead>Mặt hàng</TableHead>
              <TableHead className="w-[100px] text-right">Tồn hiện tại</TableHead>
              <TableHead className="w-[110px]">Số lượng</TableHead>
              <TableHead className="w-[150px]">{isImport ? "Đơn giá nhập" : "Giá vốn"}</TableHead>
              <TableHead className="text-right">Thành tiền</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line, index) => {
              const product = byId.get(line.productId);
              return (
                <TableRow key={line.key}>
                  <TableCell>{index + 1}</TableCell>
                  <TableCell>
                    <Select value={line.productId} onValueChange={(v) => selectProduct(line.key, v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Chọn mặt hàng" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(grouped).map(([category, items]) => (
                          <SelectGroup key={category}>
                            <SelectLabel>{category}</SelectLabel>
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
                  </TableCell>
                  <TableCell className="text-right">
                    {product ? formatNumber(product.stockQuantity) : "—"}
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      value={line.quantity}
                      onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                    />
                  </TableCell>
                  <TableCell>
                    {isImport ? (
                      <Input
                        type="number"
                        min={0}
                        value={line.unitCost}
                        onChange={(e) => updateLine(line.key, { unitCost: e.target.value })}
                      />
                    ) : (
                      formatNumber(product?.costPrice)
                    )}
                  </TableCell>
                  <TableCell className="text-right font-medium">{formatNumber(lineCost(line))}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={lines.length === 1}
                      onClick={() => setLines((current) => current.filter((l) => l.key !== line.key))}
                      className="text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        <div className="flex items-center justify-between border-t pt-4">
          <Button variant="outline" onClick={() => setLines((current) => [...current, emptyLine()])}>
            <Plus className="mr-2 h-4 w-4" /> Thêm dòng
          </Button>
          <div className="text-xl font-bold">
            Tổng cộng: <span className="text-red-600">{formatMoney(total)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
