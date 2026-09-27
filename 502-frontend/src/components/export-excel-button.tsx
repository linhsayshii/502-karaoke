"use client";

import { useState } from "react";
import { DownloadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useNotify } from "@/hooks/use-notify";

// "Xuất Excel" of a list or a report. `onExport` undefined disables it (no
// data yet); errors become a toast.
export function ExportExcelButton({
  onExport,
  className,
}: {
  onExport?: () => Promise<void>;
  className?: string;
}) {
  const notify = useNotify();
  const [exporting, setExporting] = useState(false);

  const run = async () => {
    if (!onExport) return;
    setExporting(true);
    try {
      await onExport();
    } catch (error) {
      notify.error(error, "Không thể xuất file Excel");
    } finally {
      setExporting(false);
    }
  };

  return (
    <Button variant="outline" className={className} onClick={run} disabled={!onExport || exporting}>
      {exporting ? <Spinner data-icon="inline-start" /> : <DownloadIcon data-icon="inline-start" />}
      Xuất Excel
    </Button>
  );
}
