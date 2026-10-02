import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHmac } from 'crypto';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  SESSION_TTL_SECONDS,
  jwtRefreshSecret,
} from '../config/env';
import { AuthUser } from './auth-user';
import { LoginThrottle } from './login-throttle';
import { canUseReportSite } from './roles';

// Compared against when the username does not exist, so a wrong username takes
// as long as a wrong password and does not reveal which accounts exist.
const DUMMY_HASH = bcrypt.hashSync('khong-co-tai-khoan', 10);

interface RefreshPayload {
  sub: number;
  // Stamp of the password the session was opened with (see passwordStamp).
  pwd?: string;
  exp: number;
}

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private loginThrottle: LoginThrottle,
  ) {}

  // Changes whenever the password changes (the bcrypt hash has a new salt), so
  // changing or resetting a password ends every session opened before it.
  private passwordStamp(passwordHash: string) {
    return createHmac('sha256', jwtRefreshSecret())
      .update(passwordHash)
      .digest('base64url')
      .slice(0, 22);
  }

  // Never valid past the end of the session it belongs to.
  private signAccessToken(user: AuthUser, sessionSecondsLeft: number) {
    const payload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      branchId: user.branchId,
    };
    return this.jwtService.sign(payload, {
      expiresIn: Math.max(
        1,
        Math.min(ACCESS_TOKEN_TTL_SECONDS, sessionSecondsLeft),
      ),
    });
  }

  // A new session: it ends SESSION_TTL_SECONDS from now, however much it is used.
  private startSession(user: AuthUser, passwordHash: string) {
    const refreshToken = this.jwtService.sign(
      { sub: user.id, pwd: this.passwordStamp(passwordHash) },
      { expiresIn: SESSION_TTL_SECONDS, secret: jwtRefreshSecret() },
    );
    const { exp } = this.jwtService.decode<{ exp: number }>(refreshToken);
    return {
      access_token: this.signAccessToken(user, SESSION_TTL_SECONDS),
      refresh_token: refreshToken,
      sessionExpiresAt: new Date(exp * 1000).toISOString(),
    };
  }

  async login(username: string, pass: string, site?: 'report') {
    this.loginThrottle.assertAllowed(username);

    const account = await this.usersService.findOne(username);
    const hashMatches = await bcrypt.compare(
      pass,
      account?.password ?? DUMMY_HASH,
    );
    if (!account?.password || !hashMatches) {
      this.loginThrottle.recordFailure(username);
      throw new UnauthorizedException('Tên đăng nhập hoặc mật khẩu không đúng');
    }
    this.loginThrottle.recordSuccess(username);
    if (!account.active) {
      throw new UnauthorizedException('Tài khoản đã bị khóa');
    }

    const user = await this.usersService.findAuthUser(account.id);
    if (!user) {
      throw new UnauthorizedException('Tài khoản đã bị khóa');
    }

    // Only an early answer for the login form: every route of the report site
    // checks canUseReportSite itself (spec 2026-10-02 §3.2).
    if (site === 'report' && !canUseReportSite(user)) {
      throw new ForbiddenException(
        'Tài khoản này không được vào trang báo cáo',
      );
    }

    return { ...this.startSession(user, account.password), user };
  }

  // A new access token inside the current session; the session's end stays put.
  async refresh(refreshToken: string) {
    let payload: RefreshPayload;
    try {
      payload = this.jwtService.verify<RefreshPayload>(refreshToken, {
        secret: jwtRefreshSecret(),
      });
    } catch {
      throw new UnauthorizedException(
        'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại',
      );
    }

    const account = await this.usersService.findById(payload.sub);
    const user = account?.password
      ? await this.usersService.findAuthUser(account.id)
      : null;
    if (
      !account?.password ||
      !user ||
      payload.pwd !== this.passwordStamp(account.password)
    ) {
      throw new UnauthorizedException(
        'Phiên đăng nhập không còn hiệu lực, vui lòng đăng nhập lại',
      );
    }

    const secondsLeft = payload.exp - Math.floor(Date.now() / 1000);
    return {
      access_token: this.signAccessToken(user, secondsLeft),
      sessionExpiresAt: new Date(payload.exp * 1000).toISOString(),
      user,
    };
  }

  // Ends the other sessions of the account (see passwordStamp) and starts a
  // new one for the caller.
  async changePassword(user: AuthUser, oldPass: string, newPass: string) {
    const account = await this.usersService.findById(user.id);
    if (!account?.password) {
      throw new UnauthorizedException('Phiên đăng nhập không hợp lệ');
    }

    const isMatch = await bcrypt.compare(oldPass, account.password);
    if (!isMatch) {
      throw new BadRequestException('Mật khẩu cũ không chính xác');
    }

    const hashedNewPassword = await bcrypt.hash(newPass, 10);
    await this.usersService.updatePassword(user.id, hashedNewPassword);

    return {
      message: 'Đổi mật khẩu thành công',
      ...this.startSession(user, hashedNewPassword),
    };
  }
}
