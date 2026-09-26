"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pencil, Plus, Trash2 } from "lucide-react";
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
import { useApiData } from "@/hooks/use-api-data";
import { useNotify } from "@/hooks/use-notify";
import type { Category } from "@/lib/types";

// Product categories of the current branch (used by Bán hàng and Kho).
export function CategoryManager() {
  const branch = useBranchCode();
  const notify = useNotify();
  const { data: categories, reload: load } = useApiData<Category[]>(
    "/categories",
    { branch },
    [],
    "Không thể tải danh mục",
  );
  const [newName, setNewName] = useState("");

  const add = async () => {
    if (!newName.trim()) return;
    try {
      await api.post("/categories", { name: newName.trim() }, { params: { branch } });
      setNewName("");
      notify.success("Đã thêm danh mục");
      load();
    } catch (error) {
      notify.error(error, "Không thể thêm danh mục");
    }
  };

  const rename = async (category: Category) => {
    const name = window.prompt("Tên danh mục mới", category.name)?.trim();
    if (!name || name === category.name) return;
    try {
      await api.patch(`/categories/${category.id}`, { name });
      load();
    } catch (error) {
      notify.error(error, "Không thể đổi tên danh mục");
    }
  };

  const remove = async (category: Category) => {
    if (
      !window.confirm(
        `Xóa danh mục "${category.name}"? Các mặt hàng trong danh mục sẽ chuyển sang "Chưa phân loại".`,
      )
    ) {
      return;
    }
    try {
      await api.delete(`/categories/${category.id}`);
      notify.success("Đã xóa danh mục");
      load();
    } catch (error) {
      notify.error(error, "Không thể xóa danh mục");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Danh mục mặt hàng</CardTitle>
        <CardDescription>Nhóm đồ ăn, đồ uống của cơ sở.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex gap-4">
          <Input
            placeholder="Nhập tên danh mục mới..."
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          <Button onClick={add}>
            <Plus className="mr-2 h-4 w-4" /> Thêm
          </Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]">STT</TableHead>
              <TableHead>Tên danh mục</TableHead>
              <TableHead className="w-[120px] text-right">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.map((category, index) => (
              <TableRow key={category.id}>
                <TableCell>{index + 1}</TableCell>
                <TableCell className="font-medium">{category.name}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => rename(category)} title="Đổi tên">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => remove(category)}
                    className="text-red-500 hover:bg-red-50 hover:text-red-700"
                    title="Xóa"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {categories.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                  Chưa có danh mục nào.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
