"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CategoryManager } from "@/components/catalog/category-manager";
import { ProductManager } from "@/components/catalog/product-manager";

export default function InventorySettingsPage() {
  return (
    <Tabs defaultValue="products" className="space-y-4">
      <TabsList>
        <TabsTrigger value="products">Mặt hàng</TabsTrigger>
        <TabsTrigger value="categories">Danh mục</TabsTrigger>
      </TabsList>
      <TabsContent value="products">
        <ProductManager />
      </TabsContent>
      <TabsContent value="categories">
        <CategoryManager />
      </TabsContent>
    </Tabs>
  );
}
