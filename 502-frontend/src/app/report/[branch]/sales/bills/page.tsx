"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { useBranchCode } from "@/lib/branch";

// Placeholder until Task 11: shows the path the browser sees.
export default function ReportBillsPage() {
  const branch = useBranchCode();
  const pathname = usePathname();
  return (
    <>
      <PageHeader title="Quản lý bán hàng" description={`Đường dẫn: ${pathname}`} />
      <Link href={`/${branch}/reports/revenue`} className="underline">
        Sang Doanh thu
      </Link>
    </>
  );
}
