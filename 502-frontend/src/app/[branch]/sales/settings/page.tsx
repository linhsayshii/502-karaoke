"use client";

import { DoorOpenIcon, PackageIcon, TagsIcon } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CategoryManager } from "@/components/catalog/category-manager";
import { ProductManager } from "@/components/catalog/product-manager";
import { RoomManager } from "@/components/catalog/room-manager";
import { PageHeader } from "@/components/layout/page-header";

export default function SalesSettingsPage() {
  return (
    <>
      <PageHeader
        title="Cài đặt bán hàng"
        description="Phòng, mặt hàng và danh mục của cơ sở. Nhân viên được quản lý trong Quản trị → Tài khoản."
      />
      <Tabs defaultValue="rooms" className="gap-4">
        <TabsList>
          <TabsTrigger value="rooms">
            <DoorOpenIcon />
            Phòng
          </TabsTrigger>
          <TabsTrigger value="products">
            <PackageIcon />
            Mặt hàng
          </TabsTrigger>
          <TabsTrigger value="categories">
            <TagsIcon />
            Danh mục
          </TabsTrigger>
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
    </>
  );
}
