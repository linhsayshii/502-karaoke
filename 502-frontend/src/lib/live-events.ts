import type { DiscountRequestStatus } from "@/lib/types";

// Signals from the server (ids only; the screen then calls the REST API), plus
// one local signal: the socket came back after a drop, so a screen reloads
// once because it may have missed events.
export type LiveEvent =
  | { type: "room.changed"; branchId: number; roomId: number }
  | { type: "order.changed"; branchId: number; orderId: number }
  | { type: "discount.requested"; branchId: number; requestId: number }
  | { type: "discount.decided"; branchId: number; orderId: number; requestId: number; status: DiscountRequestStatus }
  | { type: "reconnected" };

// ws(s)://…/api/ws next to the REST base: same origin in production (/api),
// the backend's origin in development.
export function liveUrl(): string {
  const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
  const url = new URL(`${base.replace(/\/$/, "")}/ws`, window.location.origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}
