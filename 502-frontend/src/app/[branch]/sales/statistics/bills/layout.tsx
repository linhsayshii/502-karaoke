import type { Metadata } from "next";

export const metadata: Metadata = { title: "Hóa đơn" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
