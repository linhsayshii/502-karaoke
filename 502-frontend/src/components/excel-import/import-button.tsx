"use client";

import Link from "next/link";
import { FileSpreadsheetIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBranchCode } from "@/lib/branch";
import type { ImportType } from "@/lib/excel-import/definitions";

// Shortcut from a list page to the Excel import of the same data.
export function ExcelImportButton({ type, size = "default" }: { type: ImportType; size?: "default" | "sm" }) {
  const branch = useBranchCode();
  return (
    <Button variant="outline" size={size} asChild>
      <Link href={`/${branch}/imports?type=${type}`}>
        <FileSpreadsheetIcon data-icon="inline-start" />
        Nhập Excel
      </Link>
    </Button>
  );
}
