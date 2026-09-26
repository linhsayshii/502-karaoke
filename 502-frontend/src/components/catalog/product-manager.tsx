"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Ban, Pencil, Plus, RotateCcw } from "lucide-react";
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
import api from "@/lib/api";
import { useBranchCode } from "@/lib/branch";
import { formatMoney, formatNumber } from "@/lib/format";
import { useApiData } from "@/hooks/use-api-data";
import { useNotify } from "@/hooks/use-notify";
import type { Category, Product } from "@/lib/types";

const NO_CATEGORY = "none";

interface ProductForm {
  name: string;
  categoryId: string;
  price: string;
  unit: string;
  trackStock: boolean;
}

const EMPTY_FORM: ProductForm = {
  name: "",
  categoryId: NO_CATEGORY,
  price: "",
  unit: "",
  trackStock: true,
};

// Menu items of the current branch. Stock and cost price are read-only here:
// they change through phiếu nhập/xuất and checkout.
export function ProductManager() {
  const branch = useBranchCode();
  const notify = useNotify();
  const { data: products, reload: load } = useApiData<Product[]>(
    "/products",
    { branch, includeInactive: true },
    [],
    "Không thể tải danh sách mặt hàng",
  );
  // Categories are reloaded whenever the dialog opens (they may change in the other tab).
  const categoriesQuery = useApiData<Category[]>("/categories", { branch }, [], "Không thể tải danh mục");
  const categories = categoriesQuery.data;
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const [form, setForm] = useState<ProductForm>(EMPTY_FORM);

  const openForm = (product: Product | "new") => {
    categoriesQuery.reload();
    setEditing(product);
    setForm(
      product === "new"
        ? EMPTY_FORM
        : {
            name: product.name,
            categoryId: product.categoryId ? String(product.categoryId) : NO_CATEGORY,
            price: String(Number(product.price)),
            unit: product.unit,
            trackStock: product.trackStock,
          },
    );
  };

  const save = async () => {
    const body = {
      name: form.name.trim(),
      categoryId: form.categoryId === NO_CATEGORY ? null : Number(form.categoryId),
      price: Number(form.price),
      unit: form.unit.trim(),
      trackStock: form.trackStock,
    };
    if (!body.name || !body.unit || form.price === "" || !(body.price >= 0)) {
      notify.error(null, "Vui lòng nhập tên, đơn vị tính và giá bán hợp lệ");
      return;
    }
    try {
      if (editing === "new") {
        await api.post("/products", body, { params: { branch } });
        notify.success("Đã thêm mặt hàng");
      } else if (editing) {
        await api.patch(`/products/${editing.id}`, body);
        notify.success("Đã cập nhật mặt hàng");
      }
      setEditing(null);
      load();
    } catch (error) {
      notify.error(error, "Không thể lưu mặt hàng");
    }
  };

  const setActive = async (product: Product, active: boolean) => {
    if (!active && !window.confirm(`Ngừng bán "${product.name}"?`)) return;
    try {
      if (active) await api.patch(`/products/${product.id}`, { active: true });
      else await api.delete(`/products/${product.id}`);
      load();
    } catch (error) {
      notify.error(error, "Không thể cập nhật mặt hàng");
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Mặt hàng</CardTitle>
          <CardDescription>
            Đồ ăn, đồ uống, phụ thu. Tồn kho và giá vốn cập nhật qua phiếu nhập/xuất kho.
          </CardDescription>
        </div>
        <Button size="sm" onClick={() => openForm("new")}>
          <Plus className="mr-2 h-4 w-4" /> Thêm mặt hàng
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tên hàng</TableHead>
              <TableHead>Danh mục</TableHead>
              <TableHead>ĐVT</TableHead>
              <TableHead className="text-right">Giá bán</TableHead>
              <TableHead className="text-right">Giá vốn</TableHead>
              <TableHead className="text-right">Tồn kho</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead className="w-[100px] text-right">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((product) => (
              <TableRow key={product.id} className={product.active ? "" : "opacity-60"}>
                <TableCell className="font-medium">{product.name}</TableCell>
                <TableCell>{product.category?.name ?? "Chưa phân loại"}</TableCell>
                <TableCell>{product.unit}</TableCell>
                <TableCell className="text-right">{formatMoney(product.price)}</TableCell>
                <TableCell className="text-right">{formatMoney(product.costPrice)}</TableCell>
                <TableCell className="text-right">
                  {product.trackStock ? formatNumber(product.stockQuantity) : "Không quản lý"}
                </TableCell>
                <TableCell>
                  {product.active ? (
                    <Badge variant="secondary">Đang bán</Badge>
                  ) : (
                    <Badge variant="outline">Ngừng bán</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => openForm(product)} title="Sửa">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  {product.active ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setActive(product, false)}
                      className="text-red-500 hover:bg-red-50 hover:text-red-700"
                      title="Ngừng bán"
                    >
                      <Ban className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setActive(product, true)}
                      title="Bán lại"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {products.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                  Chưa có mặt hàng nào.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "Thêm mặt hàng" : "Sửa mặt hàng"}</DialogTitle>
            <DialogDescription>
              Giá bán mới chỉ áp dụng cho món gọi sau khi lưu; món đã gọi giữ giá cũ.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Tên hàng</Label>
              <Input
                className="col-span-3"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Danh mục</Label>
              <Select
                value={form.categoryId}
                onValueChange={(categoryId) => setForm({ ...form, categoryId })}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CATEGORY}>Chưa phân loại</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Giá bán</Label>
              <Input
                className="col-span-3"
                type="number"
                min={0}
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Đơn vị tính</Label>
              <Input
                className="col-span-3"
                placeholder="lon, chai, dĩa..."
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <div />
              <div className="col-span-3 flex items-center gap-2">
                <Checkbox
                  id="trackStock"
                  checked={form.trackStock}
                  onCheckedChange={(checked) => setForm({ ...form, trackStock: checked === true })}
                />
                <Label htmlFor="trackStock" className="font-normal">
                  Quản lý tồn kho (bỏ chọn cho phụ thu, dịch vụ)
                </Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Hủy
            </Button>
            <Button onClick={save}>Lưu</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
