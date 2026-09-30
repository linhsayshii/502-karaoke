"use client";

import { useCallback, useEffect, useRef } from "react";

// Runs `fn` once, `waitMs` after the first call of a burst: several signals
// within the window (a checkout emits two, five cashiers open rooms at once)
// become one reload. The pending run is dropped on unmount.
export function useCoalesced(fn: () => void, waitMs: number): () => void {
  const fnRef = useRef(fn);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Keep the latest `fn` for the delayed run (refs are written in effects, not in render).
  useEffect(() => {
    fnRef.current = fn;
  });
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      // Also reset it: a cleanup without a real unmount (Fast Refresh, React
      // Activity) must not leave the coalescer thinking a run is pending.
      timer.current = null;
    },
    [],
  );
  return useCallback(() => {
    if (timer.current) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      fnRef.current();
    }, waitMs);
  }, [waitMs]);
}
