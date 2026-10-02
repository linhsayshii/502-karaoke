"use client";

import { Suspense } from "react";
import { EinvoicesPage } from "@/components/einvoices/einvoices-page";

export default function MainEinvoicesPage() {
  return (
    <Suspense>
      <EinvoicesPage site="main" />
    </Suspense>
  );
}
