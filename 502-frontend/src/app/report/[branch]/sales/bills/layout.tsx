import type { Metadata } from "next";

export const metadata: Metadata = { title: "Quản lý bán hàng" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
