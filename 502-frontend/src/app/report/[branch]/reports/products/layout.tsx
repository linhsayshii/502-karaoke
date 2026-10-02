import type { Metadata } from "next";

export const metadata: Metadata = { title: "Hàng hóa" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
