import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sơ đồ phòng" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
