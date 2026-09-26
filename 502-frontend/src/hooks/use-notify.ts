"use client";

import { useMemo } from "react";
import { toast } from "sonner";
import { apiErrorMessage } from "@/lib/api";

// Toasts for the usual "done" / "API call failed" outcomes.
export function useNotify() {
  return useMemo(
    () => ({
      success: (description: string) => toast.success(description),
      error: (err: unknown, fallback: string) => toast.error(apiErrorMessage(err, fallback)),
    }),
    [],
  );
}
