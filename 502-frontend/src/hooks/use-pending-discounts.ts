"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import { useLiveEvent, useLiveInterval } from "@/hooks/use-live-events";
import { usePolling } from "@/hooks/use-polling";
import api from "@/lib/api";
import { can } from "@/lib/permissions";

// Fired by the Duyệt giảm giá page after a decision, so the badge updates at once.
export const DISCOUNTS_CHANGED = "discounts-changed";

// Requests waiting for this manager (own branch; the chain manager: every
// branch). Polled every 15 s (60 s while the socket is up) on managers' screens only; null for others.
export function usePendingDiscounts(): number | null {
  const { user } = useAuth();
  const enabled = can(user, "discounts.approve");
  const [count, setCount] = useState<number | null>(null);
  // Last count seen: the toast fires only when it grows, never on first load.
  const last = useRef<number | null>(null);
  // Numbers the requests: a response older than one already applied is dropped,
  // so overlapping loads (poll + DISCOUNTS_CHANGED) never fake a rise.
  const requestSeq = useRef(0);
  const appliedSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    try {
      const { data } = await api.get<{ count: number }>("/discount-requests/pending-count");
      if (seq < appliedSeq.current) return;
      appliedSeq.current = seq;
      if (last.current !== null && data.count > last.current) {
        toast.info("Có yêu cầu giảm giá mới chờ duyệt");
      }
      last.current = data.count;
      setCount(data.count);
    } catch {
      // The next tick retries.
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    // Deferred one tick so the effect body itself sets no state.
    const first = setTimeout(load, 0);
    window.addEventListener(DISCOUNTS_CHANGED, load);
    return () => {
      clearTimeout(first);
      window.removeEventListener(DISCOUNTS_CHANGED, load);
    };
  }, [enabled, load]);
  usePolling(load, useLiveInterval(60_000, 15_000), enabled);
  // A new or decided request reloads the count at once (the toast still
  // fires from the count growing, so it never fires twice).
  useLiveEvent((event) => {
    if (!enabled) return;
    if (event.type === "discount.requested" || event.type === "discount.decided" || event.type === "reconnected") load();
  });

  return enabled ? count : null;
}
