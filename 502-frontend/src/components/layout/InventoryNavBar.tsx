"use client";

import { SubNavBar } from "@/components/layout/SubNavBar";

export function InventoryNavBar() {
  return (
    <SubNavBar
      items={[
        { label: "Tồn kho", path: "/inventory/stock" },
        { label: "Nhập hàng", path: "/inventory/import" },
        { label: "Xuất hàng", path: "/inventory/export" },
        { label: "Phiếu kho", path: "/inventory/documents" },
        { label: "Danh mục", path: "/inventory/settings" },
      ]}
    />
  );
}
