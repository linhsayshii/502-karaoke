import type { Metadata } from "next";

export const metadata: Metadata = { title: "Báo cáo lãi lỗ" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
