"use client";

import { useMemo, useState } from "react";
import {
  BanIcon,
  MoreHorizontalIcon,
  PackageIcon,
  PencilIcon,
  PlusIcon,
  RotateCcwIcon,
  SearchIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { TableEmpty, TableSkeleton } from "@/components/data-states";
import { useApiData } from "@/hooks/use-api-data";
import { useNotify } from "@/hooks/use-notify";
import api from "@/lib/api";
import { useBranchCode } from "@/lib/branch";
import { formatNumber } from "@/lib/format";
import { ONLY_NARROW, SHOW_FROM } from "@/lib/responsive";
import type { Category, Product } from "@/lib/types";
import { cn } from "@/lib/utils";

const NO_CATEGORY = "none";
const ALL = "all";

interface ProductForm {
  name: string;
  categoryId: string;
  price: string;
  unit: string;
  trackStock: boolean;
}

const EMPTY_FORM: ProductForm = { name: "", categoryId: NO_CATEGORY, price: "", unit: "", trackStock: true };

// Menu items of the current branch. Stock and cost price are read-only here:
// they change through phiếu nhập/xuất and checkout.
export function ProductManager() {
  const branch = useBranchCode();
  const notify = useNotify();
  const {
    data: products,
    loading,
    reload,
  } = useApiData<Product[]>("/products", { branch, includeInactive: true }, [], "Không thể tải danh sách mặt hàng");
  // Reloaded whenever the form opens (categories may change in the other tab).
  const categoriesQuery = useApiData<Category[]>("/categories", { branch }, [], "Không thể tải danh mục");
  const categories = categoriesQuery.data;
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState(ALL);
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const [form, setForm] = useState<ProductForm>(EMPTY_FORM);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deactivating, setDeactivating] = useState<Product | null>(null);

  const keyword = search.trim().toLowerCase();
  const shown = useMemo(
    () =>
      products.filter(
        (p) =>
          (showInactive || p.active) &&
          p.name.toLowerCase().includes(keyword) &&
          (categoryFilter === ALL ||
            (categoryFilter === NO_CATEGORY ? !p.categoryId : String(p.categoryId) === categoryFilter)),
      ),
    [products, showInactive, keyword, categoryFilter],
  );

  const openForm = (product: Product | "new") => {
    categoriesQuery.reload();
    setEditing(product);
    setSubmitted(false);
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

  const invalid = {
    name: submitted && !form.name.trim(),
    unit: submitted && !form.unit.trim(),
    price: submitted && (form.price === "" || !(Number(form.price) >= 0)),
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!form.name.trim() || !form.unit.trim() || form.price === "" || !(Number(form.price) >= 0)) return;
    const body = {
      name: form.name.trim(),
      categoryId: form.categoryId === NO_CATEGORY ? null : Number(form.categoryId),
      price: Number(form.price),
      unit: form.unit.trim(),
      trackStock: form.trackStock,
    };
    setSaving(true);
    try {
      if (editing === "new") {
        await api.post("/products", body, { params: { branch } });
        notify.success(`Đã thêm "${body.name}"`);
      } else if (editing) {
        await api.patch(`/products/${editing.id}`, body);
        notify.success(`Đã cập nhật "${body.name}"`);
      }
      setEditing(null);
      reload();
    } catch (error) {
      notify.error(error, "Không thể lưu mặt hàng");
    } finally {
      setSaving(false);
    }
  };

  const setActive = async (product: Product, active: boolean) => {
    try {
      if (active) await api.patch(`/products/${product.id}`, { active: true });
      else await api.delete(`/products/${product.id}`);
      notify.success(active ? `"${product.name}" đã bán lại` : `Đã ngừng bán "${product.name}"`);
      reload();
    } catch (error) {
      notify.error(error, "Không thể cập nhật mặt hàng");
      return false;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mặt hàng</CardTitle>
        <CardDescription>
          Đồ ăn, đồ uống, phụ thu. Tồn kho và giá vốn thay đổi qua phiếu nhập/xuất kho và khi thanh toán.
        </CardDescription>
        <CardAction>
          <Button size="sm" onClick={() => openForm("new")}>
            <PlusIcon data-icon="inline-start" />
            Thêm mặt hàng
          </Button>
        </CardAction>
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
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="md:w-48" aria-label="Lọc danh mục">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={ALL}>Tất cả danh mục</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
                <SelectItem value={NO_CATEGORY}>Chưa phân loại</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2 md:ml-auto">
            <Switch id="show-inactive" checked={showInactive} onCheckedChange={setShowInactive} />
            <Label htmlFor="show-inactive" className="font-normal">
              Hiện hàng ngừng bán
            </Label>
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mặt hàng</TableHead>
              <TableHead className={SHOW_FROM.md}>Danh mục</TableHead>
              <TableHead className={SHOW_FROM.sm}>ĐVT</TableHead>
              <TableHead className="text-right">Giá bán</TableHead>
              <TableHead className={cn("text-right", SHOW_FROM.lg)}>Giá vốn</TableHead>
              <TableHead className={cn("text-right", SHOW_FROM.sm)}>Tồn kho</TableHead>
              <TableHead className={SHOW_FROM.sm}>Trạng thái</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && products.length === 0 ? (
              <TableSkeleton
                columns={["", SHOW_FROM.md, SHOW_FROM.sm, "", SHOW_FROM.lg, SHOW_FROM.sm, SHOW_FROM.sm, ""]}
              />
            ) : shown.length === 0 ? (
              <TableEmpty
                colSpan={8}
                icon={PackageIcon}
                title={products.length === 0 ? "Chưa có mặt hàng nào" : "Không có mặt hàng phù hợp"}
                description={
                  products.length === 0 ? "Thêm đồ ăn, đồ uống để thu ngân gọi món vào phòng." : "Thử bộ lọc khác."
                }
              />
            ) : (
              shown.map((product) => (
                <TableRow key={product.id} className={cn(!product.active && "text-muted-foreground")}>
                  <TableCell className="whitespace-normal">
                    <div className="font-medium">{product.name}</div>
                    <div className={cn("text-xs text-muted-foreground", ONLY_NARROW)}>
                      {product.unit}
                      {!product.active ? " · ngừng bán" : product.trackStock ? "" : " · dịch vụ"}
                    </div>
                  </TableCell>
                  <TableCell className={SHOW_FROM.md}>{product.category?.name ?? "Chưa phân loại"}</TableCell>
                  <TableCell className={SHOW_FROM.sm}>{product.unit}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(product.price)}</TableCell>
                  <TableCell className={cn("text-right tabular-nums", SHOW_FROM.lg)}>
                    {formatNumber(product.costPrice)}
                  </TableCell>
                  <TableCell className={cn("text-right tabular-nums", SHOW_FROM.sm)}>
                    {product.trackStock ? formatNumber(product.stockQuantity) : "—"}
                  </TableCell>
                  <TableCell className={SHOW_FROM.sm}>
                    {!product.active ? (
                      <Badge variant="outline">Ngừng bán</Badge>
                    ) : product.trackStock ? (
                      <Badge variant="secondary">Đang bán</Badge>
                    ) : (
                      <Badge variant="secondary">Dịch vụ</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={`Thao tác ${product.name}`}>
                          <MoreHorizontalIcon />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuGroup>
                          <DropdownMenuItem onSelect={() => openForm(product)}>
                            <PencilIcon />
                            Sửa
                          </DropdownMenuItem>
                          {product.active ? (
                            <DropdownMenuItem variant="destructive" onSelect={() => setDeactivating(product)}>
                              <BanIcon />
                              Ngừng bán
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onSelect={() => setActive(product, true)}>
                              <RotateCcwIcon />
                              Bán lại
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && !saving && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={save} className="flex flex-col gap-6">
            <DialogHeader>
              <DialogTitle>{editing === "new" ? "Thêm mặt hàng" : "Sửa mặt hàng"}</DialogTitle>
              <DialogDescription>Giá bán mới áp dụng cho món gọi sau khi lưu; món đã gọi giữ giá cũ.</DialogDescription>
            </DialogHeader>
            <FieldGroup>
              <Field data-invalid={invalid.name || undefined}>
                <FieldLabel htmlFor="product-name">Tên mặt hàng</FieldLabel>
                <Input
                  id="product-name"
                  value={form.name}
                  aria-invalid={invalid.name || undefined}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
                {invalid.name && <FieldError>Vui lòng nhập tên mặt hàng</FieldError>}
              </Field>
              <Field>
                <FieldLabel htmlFor="product-category">Danh mục</FieldLabel>
                <Select value={form.categoryId} onValueChange={(categoryId) => setForm({ ...form, categoryId })}>
                  <SelectTrigger id="product-category" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value={NO_CATEGORY}>Chưa phân loại</SelectItem>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field data-invalid={invalid.price || undefined}>
                  <FieldLabel htmlFor="product-price">Giá bán</FieldLabel>
                  <InputGroup>
                    <InputGroupInput
                      id="product-price"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1000}
                      value={form.price}
                      aria-invalid={invalid.price || undefined}
                      onChange={(e) => setForm({ ...form, price: e.target.value })}
                    />
                    <InputGroupAddon align="inline-end">
                      <InputGroupText>đ</InputGroupText>
                    </InputGroupAddon>
                  </InputGroup>
                  {invalid.price && <FieldError>Giá không hợp lệ</FieldError>}
                </Field>
                <Field data-invalid={invalid.unit || undefined}>
                  <FieldLabel htmlFor="product-unit">Đơn vị tính</FieldLabel>
                  <Input
                    id="product-unit"
                    placeholder="lon, chai, dĩa..."
                    value={form.unit}
                    aria-invalid={invalid.unit || undefined}
                    onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  />
                  {invalid.unit && <FieldError>Vui lòng nhập đơn vị</FieldError>}
                </Field>
              </div>
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldLabel htmlFor="product-track">Quản lý tồn kho</FieldLabel>
                  <FieldDescription>Tắt cho phụ thu, dịch vụ (không trừ kho khi thanh toán).</FieldDescription>
                </FieldContent>
                <Switch
                  id="product-track"
                  checked={form.trackStock}
                  onCheckedChange={(trackStock) => setForm({ ...form, trackStock })}
                />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(null)} disabled={saving}>
                Hủy
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Spinner data-icon="inline-start" />}
                Lưu
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deactivating}
        onOpenChange={(open) => !open && setDeactivating(null)}
        title={`Ngừng bán "${deactivating?.name ?? ""}"?`}
        description="Mặt hàng không còn hiện trong thực đơn; lịch sử hóa đơn và kho vẫn giữ nguyên. Hàng còn tồn vẫn xuất kho được."
        confirmLabel="Ngừng bán"
        destructive
        onConfirm={async () => {
          if (deactivating) return setActive(deactivating, false);
        }}
      />
    </Card>
  );
}
