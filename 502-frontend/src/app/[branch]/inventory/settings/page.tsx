"use client";

import { PackageIcon, TagsIcon } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CategoryManager } from "@/components/catalog/category-manager";
import { ProductManager } from "@/components/catalog/product-manager";
import { PageHeader } from "@/components/layout/page-header";

export default function InventorySettingsPage() {
  return (
    <>
      <PageHeader
        title="Danh mục hàng"
        description="Mặt hàng và danh mục dùng chung với Bán hàng. Tồn kho thay đổi qua phiếu nhập/xuất."
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
