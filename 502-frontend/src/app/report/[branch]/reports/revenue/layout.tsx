import type { Metadata } from "next";

export const metadata: Metadata = { title: "Doanh thu" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
