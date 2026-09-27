"use client";

import { useState } from "react";
import { MoreHorizontalIcon, PencilIcon, PlusIcon, TagsIcon, Trash2Icon } from "lucide-react";
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
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ExcelImportButton } from "@/components/excel-import/import-button";
import { TableEmpty, TableSkeleton } from "@/components/data-states";
import { useApiData } from "@/hooks/use-api-data";
import { useNotify } from "@/hooks/use-notify";
import api from "@/lib/api";
import { useBranchCode } from "@/lib/branch";
import type { Category } from "@/lib/types";

// Product categories of the current branch (used by Bán hàng and Kho).
export function CategoryManager() {
  const branch = useBranchCode();
  const notify = useNotify();
  const {
    data: categories,
    loading,
    reload,
  } = useApiData<Category[]>("/categories", { branch }, [], "Không thể tải danh mục");
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<Category | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Category | null>(null);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    try {
      await api.post("/categories", { name }, { params: { branch } });
      setNewName("");
      notify.success(`Đã thêm danh mục "${name}"`);
      reload();
    } catch (error) {
      notify.error(error, "Không thể thêm danh mục");
    } finally {
      setAdding(false);
    }
  };

  const rename = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = renameValue.trim();
    if (!renaming || !name) return;
    setSaving(true);
    try {
      await api.patch(`/categories/${renaming.id}`, { name });
      notify.success("Đã đổi tên danh mục");
      setRenaming(null);
      reload();
    } catch (error) {
      notify.error(error, "Không thể đổi tên danh mục");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    try {
      await api.delete(`/categories/${deleting.id}`);
      notify.success(`Đã xóa danh mục "${deleting.name}"`);
      reload();
    } catch (error) {
      notify.error(error, "Không thể xóa danh mục");
      return false;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Danh mục mặt hàng</CardTitle>
        <CardDescription>Nhóm đồ ăn, đồ uống của cơ sở; dùng để lọc thực đơn và tồn kho.</CardDescription>
        <CardAction>
          <ExcelImportButton type="categories" size="sm" />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form onSubmit={add}>
          <InputGroup className="max-w-md">
            <InputGroupInput
              placeholder="Tên danh mục mới"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              aria-label="Tên danh mục mới"
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton type="submit" variant="default" size="sm" disabled={adding || !newName.trim()}>
                {adding ? <Spinner /> : <PlusIcon />}
                Thêm
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </form>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tên danh mục</TableHead>
              <TableHead className="text-right">Mặt hàng đang bán</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && categories.length === 0 ? (
              <TableSkeleton columns={3} rows={3} />
            ) : categories.length === 0 ? (
              <TableEmpty
                colSpan={3}
                icon={TagsIcon}
                title="Chưa có danh mục"
                description="Ví dụ: Đồ uống, Đồ ăn, Trái cây."
              />
            ) : (
              categories.map((category) => (
                <TableRow key={category.id}>
                  <TableCell className="font-medium">{category.name}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant="secondary" className="tabular-nums">
                      {category.products?.length ?? 0}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={`Thao tác ${category.name}`}>
                          <MoreHorizontalIcon />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuGroup>
                          <DropdownMenuItem
                            onSelect={() => {
                              setRenaming(category);
                              setRenameValue(category.name);
                            }}
                          >
                            <PencilIcon />
                            Đổi tên
                          </DropdownMenuItem>
                          <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(category)}>
                            <Trash2Icon />
                            Xóa
                          </DropdownMenuItem>
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

      <Dialog open={!!renaming} onOpenChange={(open) => !open && !saving && setRenaming(null)}>
        <DialogContent className="sm:max-w-sm">
          <form onSubmit={rename} className="flex flex-col gap-6">
            <DialogHeader>
              <DialogTitle>Đổi tên danh mục</DialogTitle>
              <DialogDescription>Tên danh mục không được trùng trong cùng cơ sở.</DialogDescription>
            </DialogHeader>
            <Field>
              <FieldLabel htmlFor="category-name">Tên mới</FieldLabel>
              <Input id="category-name" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRenaming(null)} disabled={saving}>
                Hủy
              </Button>
              <Button type="submit" disabled={saving || !renameValue.trim()}>
                {saving && <Spinner data-icon="inline-start" />}
                Lưu
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Xóa danh mục "${deleting?.name ?? ""}"?`}
        description='Các mặt hàng trong danh mục sẽ chuyển sang "Chưa phân loại".'
        confirmLabel="Xóa danh mục"
        destructive
        onConfirm={remove}
      />
    </Card>
  );
}
