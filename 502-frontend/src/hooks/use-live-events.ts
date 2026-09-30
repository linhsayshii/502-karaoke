"use client";

import { useEffect, useEffectEvent } from "react";
import { useLiveContext } from "@/components/live-events-provider";
import type { LiveEvent } from "@/lib/live-events";

// Calls `handler` for every event of the shared socket while mounted. The
// handler always sees the latest props/state (useEffectEvent), so callers
// need no deps and no refs.
export function useLiveEvent(handler: (event: LiveEvent) => void) {
  const { subscribe } = useLiveContext();
  const onEvent = useEffectEvent(handler);
  useEffect(() => subscribe((event) => onEvent(event)), [subscribe]);
}

export function useLiveConnected() {
  return useLiveContext().connected;
}

// The polling rhythm of a screen: slow while the socket delivers the
// signals, the old rhythm otherwise (spec §7: 60 s connected).
export function useLiveInterval(connectedMs: number, disconnectedMs: number) {
  return useLiveConnected() ? connectedMs : disconnectedMs;
}
