"use client";

import { useMemo } from "react";
import { toast } from "sonner";
import { apiErrorMessage, isSessionEnded } from "@/lib/api";

// Toasts for the usual "done" / "API call failed" outcomes.
export function useNotify() {
  return useMemo(
    () => ({
      success: (description: string) => toast.success(description),
      warning: (description: string) => toast.warning(description),
      error: (err: unknown, fallback: string) => {
        // The session ended: the auth provider already says so and goes to login.
        if (isSessionEnded(err)) return;
        toast.error(apiErrorMessage(err, fallback));
      },
    }),
    [],
  );
}
