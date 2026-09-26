"use client";

import { SubNavBar } from "@/components/layout/SubNavBar";

export function SalesNavBar() {
  return (
    <SubNavBar
      items={[
        { label: "Sơ đồ phòng", path: "/sales/rooms" },
        { label: "Thống kê", path: "/sales/statistics", permission: "sales.reports" },
        { label: "Cài đặt", path: "/sales/settings", permission: "sales.settings" },
      ]}
    />
  );
}
