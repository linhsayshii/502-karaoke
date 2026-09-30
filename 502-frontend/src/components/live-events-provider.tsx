"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { getAccessToken, onSessionChange, refreshSession } from "@/lib/api";
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
const CLOSE_AUTH = 4001;
const CLOSE_EXPIRED = 4002;

// One WebSocket for the whole app (spec §7), opened for the sales roles only.
// It sends {type:"auth", token} on open and again whenever lib/api renews the
// token; reconnects with 1, 2, 4… s up to 30 s plus 0–1 s of jitter (30 s
// flat after a 1013); stays open while the tab is hidden; closes on logout
// or when the user loses the permission. Every message is handed to the
// subscribers; a `reconnected` signal follows a re-established connection.
// A close for auth (4001/4002) while a token is held means the token ran out
// (typically in a hidden tab, where polling does not renew it): the provider
// renews the session itself and reconnects at once instead of retrying with
// the dead token. If the renewal is refused for good (401/403) the auth
// provider signs the user out, which switches `enabled` off; if it fails
// for a transient reason (server busy, network) the normal backoff reconnect
// applies and the session stays. A new token while no socket is open (renewed
// by a 401 elsewhere, or the tab coming back) reconnects at once too. If a
// reconnect right after a renewal is refused again before `ready`, the normal
// backoff applies, so a server that keeps refusing is never hammered.
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
    // A connection opened after a session renewal that has not reached `ready`.
    let renewedNoReady = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let graceTimer: ReturnType<typeof setTimeout> | undefined;

    // One throwing subscriber must not skip the others or escape onmessage.
    const dispatch = (event: LiveEvent) =>
      listeners.current.forEach((l) => {
        try {
          l(event);
        } catch (error) {
          console.error("Live event listener failed", error);
        }
      });
    const sendAuth = (ws: WebSocket) => {
      const token = getAccessToken();
      if (token && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "auth", token }));
    };

    // The normal backoff: 1, 2, 4… s up to 30 s (flat 30 s after a 1013) plus
    // 0–1 s of jitter. Used by every close that is not retried at once.
    const scheduleReconnect = (code: number) => {
      const base = code === CLOSE_TOO_MANY ? MAX_BACKOFF_MS : Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attempt);
      attempt += 1;
      reconnectTimer = setTimeout(connect, base + Math.random() * 1000);
    };

    const connect = () => {
      // Never two sockets: a timer, a renewal and a session change may race.
      if (stopped || (socket && socket.readyState !== WebSocket.CLOSED)) return;
      clearTimeout(reconnectTimer);
      const ws = new WebSocket(liveUrl());
      socket = ws;
      ws.onopen = () => sendAuth(ws);
      ws.onmessage = (e) => {
        let message: LiveEvent | { type: "ready" };
        try {
          const parsed: unknown = JSON.parse(String(e.data));
          if (typeof parsed !== "object" || parsed === null || typeof (parsed as { type?: unknown }).type !== "string") {
            return;
          }
          message = parsed as LiveEvent | { type: "ready" };
        } catch {
          return;
        }
        if (message.type === "ready") {
          attempt = 0;
          renewedNoReady = false;
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
        if ((e.code === CLOSE_AUTH || e.code === CLOSE_EXPIRED) && getAccessToken() && !renewedNoReady) {
          renewedNoReady = true;
          void refreshSession().then((ok) => {
            if (stopped) return;
            if (!ok) {
              // Not renewed: a sign-out flips `enabled` and the cleanup stops
              // everything; otherwise the failure was transient, so retry.
              scheduleReconnect(e.code);
              return;
            }
            attempt = 0;
            connect();
          });
          return;
        }
        scheduleReconnect(e.code);
      };
      // onclose follows every error; nothing to do here.
      ws.onerror = () => {};
    };

    connect();
    // A renewed access token (refresh) re-authenticates the open socket; a
    // cleared one (logout) is handled by the effect cleanup via `enabled`.
    const offSession = onSessionChange(() => {
      if (!getAccessToken()) return;
      if (socket && socket.readyState !== WebSocket.CLOSED) {
        sendAuth(socket);
        return;
      }
      // No socket open: it was waiting for a retry with a token that has
      // since been replaced, so connect at once.
      attempt = 0;
      connect();
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
