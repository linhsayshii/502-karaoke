import type { Metadata } from "next";

export const metadata: Metadata = { title: "Cơ sở" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
