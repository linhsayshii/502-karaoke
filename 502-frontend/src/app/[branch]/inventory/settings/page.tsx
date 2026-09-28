"use client";

import { PackageIcon, TagsIcon } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CategoryManager } from "@/components/catalog/category-manager";
import { ProductManager } from "@/components/catalog/product-manager";
import { ExportExcelButton } from "@/components/export-excel-button";
import { PageHeader } from "@/components/layout/page-header";
import api from "@/lib/api";
import { useBranchCode } from "@/lib/branch";
import { exportWorkbook, toSheet, type ExportColumn } from "@/lib/excel-export";
import { businessDate } from "@/lib/format";
import type { Category, Product } from "@/lib/types";

// Headers of the Excel import template first, so an export can be edited and
// imported back.
const productColumns: ExportColumn<Product>[] = [
  { header: "Tên mặt hàng", value: (p) => p.name },
  { header: "Đơn vị tính", value: (p) => p.unit },
  { header: "Giá bán", type: "money", value: (p) => Number(p.price) },
  { header: "Danh mục", value: (p) => p.category?.name ?? null },
  { header: "Quản lý tồn kho", value: (p) => (p.trackStock ? "Có" : "Không") },
  { header: "Giá vốn", type: "money", value: (p) => Number(p.costPrice) },
  { header: "Tồn kho", type: "number", value: (p) => (p.trackStock ? p.stockQuantity : null) },
  { header: "Trạng thái", value: (p) => (p.active ? "Đang bán" : "Ngừng bán") },
];

type CategoryRow = Category & { productCount: number };

const categoryColumns: ExportColumn<CategoryRow>[] = [
  { header: "Tên danh mục", value: (c) => c.name },
  { header: "Số mặt hàng", type: "number", value: (c) => c.productCount },
];

export default function InventorySettingsPage() {
  const branch = useBranchCode();

  // Every product (discontinued ones too) and category of the branch.
  const exportExcel = async () => {
    const [products, categories] = await Promise.all([
      api.get<Product[]>("/products", { params: { branch, includeInactive: true } }),
      api.get<Category[]>("/categories", { params: { branch } }),
    ]);
    const categoryRows = categories.data.map((c) => ({
      ...c,
      productCount: products.data.filter((p) => p.categoryId === c.id).length,
    }));
    await exportWorkbook(`danh-muc-hang_${branch}_${businessDate()}.xlsx`, [
      toSheet("Mặt hàng", productColumns, products.data),
      toSheet("Danh mục", categoryColumns, categoryRows),
    ]);
  };

  return (
    <>
      <PageHeader
        title="Danh mục hàng"
        info="Mặt hàng và danh mục dùng chung với Bán hàng. Tồn kho thay đổi qua phiếu nhập/xuất."
        actions={<ExportExcelButton onExport={exportExcel} />}
      />
      <Tabs defaultValue="products" className="gap-4">
        <TabsList>
          <TabsTrigger value="products">
            <PackageIcon />
            Mặt hàng
          </TabsTrigger>
          <TabsTrigger value="categories">
            <TagsIcon />
            Danh mục
          </TabsTrigger>
        </TabsList>
        <TabsContent value="products">
          <ProductManager />
        </TabsContent>
        <TabsContent value="categories">
          <CategoryManager />
        </TabsContent>
      </Tabs>
    </>
  );
}
