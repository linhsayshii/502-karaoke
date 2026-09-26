"use client";

import { SubNavBar } from "@/components/layout/SubNavBar";

export function AdminNavBar() {
  return (
    <SubNavBar
      items={[
        { label: "Tài khoản", path: "/admin/users" },
        { label: "Cơ sở", path: "/admin/branches", permission: "branches" },
      ]}
    />
  );
}
