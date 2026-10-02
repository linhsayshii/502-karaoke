"use client";

import { Suspense } from "react";
import { EinvoicesPage } from "@/components/einvoices/einvoices-page";

export default function ReportEinvoicesPage() {
  return (
    <Suspense>
      <EinvoicesPage site="report" />
    </Suspense>
  );
}
