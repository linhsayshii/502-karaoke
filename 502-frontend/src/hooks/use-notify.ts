"use client";

import { useCallback, useMemo } from "react";
import { useToast } from "@/components/ui/use-toast";
import { apiErrorMessage } from "@/lib/api";

// Toasts for the usual "done" / "API call failed" outcomes.
export function useNotify() {
  const { toast } = useToast();

  const success = useCallback(
    (description: string) => toast({ title: "Thành công", description }),
    [toast],
  );
  const error = useCallback(
    (err: unknown, fallback: string) =>
      toast({ title: "Lỗi", description: apiErrorMessage(err, fallback), variant: "destructive" }),
    [toast],
  );

  return useMemo(() => ({ success, error }), [success, error]);
}
