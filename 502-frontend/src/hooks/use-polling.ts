"use client";

import { useEffect, useEffectEvent } from "react";

// Calls `callback` every `intervalMs` while the tab is visible. A hidden tab
// (a cashier's screen left in the background all night) makes no requests;
// coming back calls it once right away, then resumes the interval.
export function usePolling(callback: () => void, intervalMs: number, enabled = true) {
  const tick = useEffectEvent(callback);

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      timer ??= setInterval(() => tick(), intervalMs);
    };
    const stop = () => {
      clearInterval(timer);
      timer = undefined;
    };
    const onVisibilityChange = () => {
      if (document.hidden) return stop();
      tick();
      start();
    };

    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [intervalMs, enabled]);
}
