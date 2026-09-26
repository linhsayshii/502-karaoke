import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { jwtRefreshSecret } from '../config/env';
import { AuthUser } from './auth-user';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  private signAccessToken(user: AuthUser) {
    const payload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      branchId: user.branchId,
    };
    return this.jwtService.sign(payload, { expiresIn: '15m' });
  }

  async login(username: string, pass: string) {
    const account = await this.usersService.findOne(username);
    const isMatch =
      !!account?.password && (await bcrypt.compare(pass, account.password));
    if (!account || !isMatch) {
      throw new UnauthorizedException('Tên đăng nhập hoặc mật khẩu không đúng');
    }
    if (!account.active) {
      throw new UnauthorizedException('Tài khoản đã bị khóa');
    }

    const user = await this.usersService.findAuthUser(account.id);
    if (!user) {
      throw new UnauthorizedException('Tài khoản đã bị khóa');
    }

    const refreshToken = this.jwtService.sign(
      { sub: user.id },
      { expiresIn: '7d', secret: jwtRefreshSecret() },
    );

    return {
      access_token: this.signAccessToken(user),
      refresh_token: refreshToken,
      user,
    };
  }

  async refresh(refreshToken: string) {
    let payload: { sub: number };
    try {
      payload = this.jwtService.verify(refreshToken, {
        secret: jwtRefreshSecret(),
      });
    } catch {
      throw new UnauthorizedException('Phiên đăng nhập đã hết hạn');
    }

    const user = await this.usersService.findAuthUser(payload.sub);
    if (!user) {
      throw new UnauthorizedException('Phiên đăng nhập không hợp lệ');
    }
    return { access_token: this.signAccessToken(user), user };
  }

  async changePassword(userId: number, oldPass: string, newPass: string) {
    const user = await this.usersService.findById(userId);
    if (!user?.password) {
      throw new UnauthorizedException('Phiên đăng nhập không hợp lệ');
    }

    const isMatch = await bcrypt.compare(oldPass, user.password);
    if (!isMatch) {
      throw new BadRequestException('Mật khẩu cũ không chính xác');
    }

    const hashedNewPassword = await bcrypt.hash(newPass, 10);
    await this.usersService.updatePassword(userId, hashedNewPassword);

    return { message: 'Đổi mật khẩu thành công' };
  }
}
