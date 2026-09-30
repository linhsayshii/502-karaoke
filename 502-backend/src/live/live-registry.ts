import { Role } from '@prisma/client';
import { LiveEvent, LiveUser } from './live-events';

// Bounds of the in-memory registry (spec §7, resource rules §1.5): the
// backend is one process, and a state that cannot grow past this fits in
// a few hundred KB whatever happens on the network.
export const MAX_SOCKETS = 100;
export const MAX_PER_USER = 5;

export interface LiveEntry {
  // null until the socket has sent a valid `auth` message.
  user: LiveUser | null;
  // Access-token expiry (unix seconds) of the last `auth`.
  exp: number | null;
  // Pings without a pong since the last one; the gateway closes at 2.
  missedPongs: number;
  connectedAt: number;
}

// Who holds a socket, by branch and for the chain managers, plus how many
// sockets each user has. Pure: the gateway feeds it sockets and reads back
// whom to send an event to. `S` is the socket type (ws.WebSocket; tests
// pass plain objects).
export class LiveRegistry<S extends object> {
  private readonly entries = new Map<S, LiveEntry>();
  private readonly byBranch = new Map<number, Set<S>>();
  private readonly chainManagers = new Set<S>();
  private readonly perUser = new Map<number, number>();

  get size() {
    return this.entries.size;
  }

  // Registers a new connection; false when the cap is reached (the caller
  // closes it with 1013).
  open(socket: S, now = Date.now()): boolean {
    if (this.entries.size >= MAX_SOCKETS) return false;
    this.entries.set(socket, {
      user: null,
      exp: null,
      missedPongs: 0,
      connectedAt: now,
    });
    return true;
  }

  // Binds the socket to its user (or renews its token). A user's sockets
  // are capped; a socket re-authenticating keeps its slot.
  authenticate(
    socket: S,
    user: LiveUser,
    exp: number,
  ): 'ok' | 'too-many' | 'unknown' {
    const entry = this.entries.get(socket);
    if (!entry) return 'unknown';
    if (entry.user?.id === user.id) {
      // Same user re-authenticating: remove old placement (branch/role may have changed),
      // then place in new location. perUser count stays 1 for this socket.
      this.removePlacement(socket, entry.user);
      entry.exp = exp;
      entry.user = user;
      this.place(socket, user);
      return 'ok';
    }
    if (entry.user) this.unplace(socket, entry.user);
    if ((this.perUser.get(user.id) ?? 0) >= MAX_PER_USER) {
      entry.user = null;
      entry.exp = null;
      return 'too-many';
    }
    this.perUser.set(user.id, (this.perUser.get(user.id) ?? 0) + 1);
    entry.user = user;
    entry.exp = exp;
    this.place(socket, user);
    return 'ok';
  }

  close(socket: S) {
    const entry = this.entries.get(socket);
    if (!entry) return;
    if (entry.user) this.unplace(socket, entry.user);
    this.entries.delete(socket);
  }

  entry(socket: S) {
    return this.entries.get(socket);
  }

  sockets(): Iterable<[S, LiveEntry]> {
    return this.entries.entries();
  }

  // Spec §7: room/order and decided events reach the whole branch, a new
  // request only its managers; chain managers get everything.
  recipients(event: LiveEvent): S[] {
    const out = new Set<S>(this.chainManagers);
    const branch = this.byBranch.get(event.branchId);
    if (branch) {
      for (const socket of branch) {
        if (event.type !== 'discount.requested') {
          out.add(socket);
          continue;
        }
        if (this.entries.get(socket)?.user?.role === Role.BRANCH_MANAGER)
          out.add(socket);
      }
    }
    return [...out];
  }

  private place(socket: S, user: LiveUser) {
    if (user.role === Role.CHAIN_MANAGER) {
      this.chainManagers.add(socket);
      return;
    }
    if (user.branchId === null) return;
    let set = this.byBranch.get(user.branchId);
    if (!set) {
      set = new Set();
      this.byBranch.set(user.branchId, set);
    }
    set.add(socket);
  }

  // Removes socket from its placement sets (byBranch / chainManagers), but not
  // from perUser. Called when role or branch changes between authentications.
  private removePlacement(socket: S, user: LiveUser) {
    this.chainManagers.delete(socket);
    if (user.branchId !== null) {
      const set = this.byBranch.get(user.branchId);
      set?.delete(socket);
      if (set && set.size === 0) this.byBranch.delete(user.branchId);
    }
  }

  private unplace(socket: S, user: LiveUser) {
    this.removePlacement(socket, user);
    const left = (this.perUser.get(user.id) ?? 1) - 1;
    if (left <= 0) this.perUser.delete(user.id);
    else this.perUser.set(user.id, left);
  }
}
