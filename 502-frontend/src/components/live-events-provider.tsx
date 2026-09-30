"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { getAccessToken, onSessionChange } from "@/lib/api";
import { type LiveEvent, liveUrl } from "@/lib/live-events";
import { can } from "@/lib/permissions";

type Listener = (event: LiveEvent) => void;

interface LiveContextValue {
  // True from the server's `ready` until DISCONNECT_GRACE_MS after a drop, so
  // polling does not flap between its two rhythms on a short hiccup.
  connected: boolean;
  subscribe: (listener: Listener) => () => void;
}

const LiveContext = createContext<LiveContextValue>({ connected: false, subscribe: () => () => {} });

const MAX_BACKOFF_MS = 30_000;
const DISCONNECT_GRACE_MS = 30_000;
// Server close codes (502-backend/src/live/live.gateway.ts).
const CLOSE_TOO_MANY = 1013;

// One WebSocket for the whole app (spec §7), opened for the sales roles only.
// It sends {type:"auth", token} on open and again whenever lib/api renews the
// token; reconnects with 1, 2, 4… s up to 30 s plus 0–1 s of jitter (30 s
// flat after a 1013); stays open while the tab is hidden; closes on logout
// or when the user loses the permission. Every message is handed to the
// subscribers; a `reconnected` signal follows a re-established connection.
export function LiveEventsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const enabled = can(user, "live");
  const [connected, setConnected] = useState(false);
  const listeners = useRef(new Set<Listener>());
  const subscribe = useRef((listener: Listener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }).current;

  useEffect(() => {
    if (!enabled) return;
    let socket: WebSocket | null = null;
    let attempt = 0;
    let wasReady = false;
    let stopped = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let graceTimer: ReturnType<typeof setTimeout> | undefined;

    const dispatch = (event: LiveEvent) => listeners.current.forEach((l) => l(event));
    const sendAuth = (ws: WebSocket) => {
      const token = getAccessToken();
      if (token && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "auth", token }));
    };

    const connect = () => {
      const ws = new WebSocket(liveUrl());
      socket = ws;
      ws.onopen = () => sendAuth(ws);
      ws.onmessage = (e) => {
        let message: LiveEvent | { type: "ready" };
        try {
          message = JSON.parse(String(e.data));
        } catch {
          return;
        }
        if (message.type === "ready") {
          attempt = 0;
          clearTimeout(graceTimer);
          graceTimer = undefined; // so the next drop starts a new grace period
          setConnected(true);
          if (wasReady) dispatch({ type: "reconnected" });
          wasReady = true;
          return;
        }
        dispatch(message);
      };
      ws.onclose = (e) => {
        if (stopped) return;
        graceTimer ??= setTimeout(() => {
          graceTimer = undefined;
          setConnected(false);
        }, DISCONNECT_GRACE_MS);
        const base = e.code === CLOSE_TOO_MANY ? MAX_BACKOFF_MS : Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attempt);
        attempt += 1;
        reconnectTimer = setTimeout(connect, base + Math.random() * 1000);
      };
      // onclose follows every error; nothing to do here.
      ws.onerror = () => {};
    };

    connect();
    // A renewed access token (refresh) re-authenticates the open socket; a
    // cleared one (logout) is handled by the effect cleanup via `enabled`.
    const offSession = onSessionChange(() => {
      if (socket) sendAuth(socket);
    });

    return () => {
      stopped = true;
      offSession();
      clearTimeout(reconnectTimer);
      clearTimeout(graceTimer);
      socket?.close(1000);
      setConnected(false);
    };
  }, [enabled]);

  return <LiveContext.Provider value={{ connected, subscribe }}>{children}</LiveContext.Provider>;
}

export function useLiveContext() {
  return useContext(LiveContext);
}
