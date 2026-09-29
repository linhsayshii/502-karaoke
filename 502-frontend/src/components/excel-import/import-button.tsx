"use client";

import Link from "next/link";
import { FileSpreadsheetIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth-provider";
import { useBranchCode } from "@/lib/branch";
import { can } from "@/lib/permissions";
import type { ImportType } from "@/lib/excel-import/definitions";

// Shortcut from a list page to the Excel import of the same data; nothing
// for accounts that cannot import (HĐQT).
export function ExcelImportButton({ type, size = "default" }: { type: ImportType; size?: "default" | "sm" }) {
  const branch = useBranchCode();
  const { user } = useAuth();
  if (!can(user, "imports")) return null;
  return (
    <Button variant="outline" size={size} asChild>
      <Link href={`/${branch}/imports?type=${type}`}>
        <FileSpreadsheetIcon data-icon="inline-start" />
        Nhập Excel
      </Link>
    </Button>
  );
}
