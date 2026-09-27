import type { Metadata } from "next";

export const metadata: Metadata = { title: "Báo cáo hàng hóa" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
