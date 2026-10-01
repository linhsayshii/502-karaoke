"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { useBranchCode } from "@/lib/branch";

// Placeholder until Task 12: shows the path the browser sees.
export default function ReportRevenuePage() {
  const branch = useBranchCode();
  const pathname = usePathname();
  return (
    <>
      <PageHeader title="Doanh thu" description={`Đường dẫn: ${pathname}`} />
      <Link href={`/${branch}/sales/bills`} className="underline">
        Về Quản lý bán hàng
      </Link>
    </>
  );
}
