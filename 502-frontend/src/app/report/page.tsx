import type { Metadata } from "next";
import { LoginPage } from "@/components/login-page";

export const metadata: Metadata = { title: "Đăng nhập trang báo cáo" };

// "/" of the report host (next.config.ts rewrites it here).
export default function ReportLoginPage() {
  return (
    <LoginPage
      eyebrow="Trang báo cáo"
      tagline="Bán hàng, hóa đơn điện tử và báo cáo tính theo hóa đơn điện tử."
      heading="Đăng nhập trang báo cáo"
    />
  );
}
