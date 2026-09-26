import type { Metadata } from "next";

export const metadata: Metadata = { title: "Đăng nhập" };

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children;
}
