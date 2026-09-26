"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CategoryManager } from "@/components/catalog/category-manager";
import { ProductManager } from "@/components/catalog/product-manager";
import { RoomManager } from "@/components/catalog/room-manager";

export default function SalesSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Cài đặt Bán hàng</h2>
        <p className="text-muted-foreground">
          Quản lý phòng, danh mục và mặt hàng của cơ sở. Nhân viên được quản lý ở mục Quản trị.
        </p>
      </div>

      <Tabs defaultValue="rooms" className="space-y-4">
        <TabsList>
          <TabsTrigger value="rooms">Phòng</TabsTrigger>
          <TabsTrigger value="products">Mặt hàng</TabsTrigger>
          <TabsTrigger value="categories">Danh mục</TabsTrigger>
        </TabsList>
        <TabsContent value="rooms">
          <RoomManager />
        </TabsContent>
        <TabsContent value="products">
          <ProductManager />
        </TabsContent>
        <TabsContent value="categories">
          <CategoryManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}
