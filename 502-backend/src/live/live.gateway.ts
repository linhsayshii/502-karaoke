import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
} from '@nestjs/websockets';
import { RawData, WebSocket } from 'ws';
import { SALES } from '../auth/roles';
import { UsersService } from '../users/users.service';
import { LiveEventsService } from './live-events.service';

// Close codes the client understands (see the frontend live-events-provider).
export const CLOSE_TOO_MANY = 1013; // ws "try again later"
export const CLOSE_AUTH = 4001; // no/invalid auth within AUTH_TIMEOUT_MS
export const CLOSE_EXPIRED = 4002; // token expired and not renewed
const CLOSE_GOING_AWAY = 1001;

export const AUTH_TIMEOUT_MS = 5_000;
export const HEARTBEAT_MS = 30_000;
// A token past its exp is tolerated this long: the screen's next poll gets a
// 401, refreshes, and re-sends `auth` (spec: close at token/session end).
export const EXPIRY_GRACE_MS = 60_000;
const MAX_MISSED_PONGS = 2;

interface AuthMessage {
  type: 'auth';
  token: string;
}

// Signal-only WebSocket at /api/ws for the cashier and manager screens
// (spec §7). A client has AUTH_TIMEOUT_MS to send {type:"auth", token}; the
// token is checked like JwtStrategy (signature, expiry, then the user is
// reloaded from the DB, active only), and only SALES roles stay. Every other
// message is ignored. Cloudflare drops silent connections after ~100 s, so
// the server pings every HEARTBEAT_MS and drops a socket after two silent
// pings. Nothing per message is logged.
@WebSocketGateway({ path: '/api/ws', maxPayload: 4096 })
export class LiveGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(LiveGateway.name);
  // The one periodic timer of the backend (resource rules §1.12 allow no
  // setInterval jobs): it belongs to the sockets, not to a schedule, and
  // stops with them.
  private heartbeat?: ReturnType<typeof setInterval>;
  private readonly authTimers = new WeakMap<
    WebSocket,
    ReturnType<typeof setTimeout>
  >();

  constructor(
    private readonly events: LiveEventsService,
    private readonly jwt: JwtService,
    private readonly users: UsersService,
  ) {}

  afterInit() {
    this.heartbeat = setInterval(() => this.tick(), HEARTBEAT_MS);
    this.heartbeat.unref?.();
  }

  onModuleDestroy() {
    clearInterval(this.heartbeat);
    for (const [socket] of this.events.registry.sockets()) {
      socket.close(CLOSE_GOING_AWAY);
    }
  }

  handleConnection(socket: WebSocket) {
    if (!this.events.registry.open(socket)) {
      socket.close(CLOSE_TOO_MANY, 'Quá nhiều kết nối, thử lại sau');
      return;
    }
    this.authTimers.set(
      socket,
      setTimeout(
        () => socket.close(CLOSE_AUTH, 'Chưa xác thực'),
        AUTH_TIMEOUT_MS,
      ),
    );
    socket.on('message', (data: RawData) => {
      // A rejected lookup (database down) must not become an unhandled
      // rejection; the client is told to try again through the auth close.
      this.onMessage(socket, data).catch((err: Error) => {
        this.logger.error(`auth: ${err.message}`);
        socket.close(CLOSE_AUTH, 'Không xác thực được, thử lại sau');
      });
    });
    socket.on('pong', () => {
      const entry = this.events.registry.entry(socket);
      if (entry) entry.missedPongs = 0;
    });
    socket.on('error', (err) => this.logger.error(`socket: ${err.message}`));
  }

  handleDisconnect(socket: WebSocket) {
    clearTimeout(this.authTimers.get(socket));
    this.authTimers.delete(socket);
    this.events.registry.close(socket);
  }

  private async onMessage(socket: WebSocket, data: RawData) {
    const message = parseAuth(data);
    if (!message) return; // anything but `auth` is ignored (spec §7)
    let payload: { sub: number; exp: number };
    try {
      payload = this.jwt.verify<{ sub: number; exp: number }>(message.token);
    } catch {
      socket.close(CLOSE_AUTH, 'Phiên đăng nhập không hợp lệ');
      return;
    }
    const user = await this.users.findAuthUser(payload.sub);
    if (!user || !SALES.includes(user.role)) {
      socket.close(CLOSE_AUTH, 'Tài khoản không dùng được kênh này');
      return;
    }
    const result = this.events.registry.authenticate(
      socket,
      { id: user.id, role: user.role, branchId: user.branchId },
      payload.exp,
    );
    if (result === 'too-many') {
      socket.close(CLOSE_TOO_MANY, 'Tài khoản đang mở quá nhiều màn hình');
      return;
    }
    if (result === 'unknown') return; // closed meanwhile
    clearTimeout(this.authTimers.get(socket));
    this.authTimers.delete(socket);
    socket.send(JSON.stringify({ type: 'ready', userId: user.id }));
  }

  // Every HEARTBEAT_MS: ping everyone, drop the silent and the expired.
  private tick() {
    const now = Date.now();
    for (const [socket, entry] of this.events.registry.sockets()) {
      if (socket.readyState !== WebSocket.OPEN) continue;
      if (entry.exp !== null && entry.exp * 1000 + EXPIRY_GRACE_MS < now) {
        socket.close(CLOSE_EXPIRED, 'Phiên đăng nhập đã hết hạn');
        continue;
      }
      if (entry.missedPongs >= MAX_MISSED_PONGS) {
        socket.terminate();
        continue;
      }
      entry.missedPongs += 1;
      socket.ping();
    }
  }
}

// The only message a client may send. Anything else (bad JSON, other types,
// a token that is not a string) is dropped without a reply.
function parseAuth(data: RawData): AuthMessage | null {
  try {
    // RawData is a Buffer, a Buffer[] (fragments) or an ArrayBuffer.
    const buffer = Array.isArray(data)
      ? Buffer.concat(data)
      : Buffer.isBuffer(data)
        ? data
        : Buffer.from(data);
    const text = buffer.toString();
    const parsed: unknown = JSON.parse(text);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      (parsed as { type?: unknown }).type === 'auth' &&
      typeof (parsed as { token?: unknown }).token === 'string'
    ) {
      return { type: 'auth', token: (parsed as { token: string }).token };
    }
  } catch {
    // not JSON
  }
  return null;
}
