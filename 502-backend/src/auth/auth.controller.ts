import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Request,
  Res,
  Get,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import type { Request as ExpressRequest, Response } from 'express';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import type { AuthUser } from './auth-user';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { SESSION_TTL_SECONDS, cookieSecure } from '../config/env';

const REFRESH_COOKIE = 'Refresh';

const refreshCookieOptions = () => ({
  httpOnly: true,
  secure: cookieSecure(),
  sameSite: 'lax' as const,
  path: '/',
});

// The cookie lives exactly as long as the session in the token it holds.
function setRefreshCookie(response: Response, refreshToken: string) {
  response.cookie(REFRESH_COOKIE, refreshToken, {
    ...refreshCookieOptions(),
    maxAge: SESSION_TTL_SECONDS * 1000,
  });
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'User login' })
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.login(
      loginDto.username,
      loginDto.password,
      loginDto.site,
    );

    setRefreshCookie(response, result.refresh_token);

    return {
      access_token: result.access_token,
      sessionExpiresAt: result.sessionExpiresAt,
      user: result.user,
    };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  async refresh(@Request() req: ExpressRequest) {
    const refreshToken = (req.cookies as Record<string, string | undefined>)[
      REFRESH_COOKIE
    ];
    if (!refreshToken) {
      throw new UnauthorizedException('Chưa đăng nhập');
    }
    return this.authService.refresh(refreshToken);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'User logout' })
  logout(@Res({ passthrough: true }) response: Response) {
    response.clearCookie(REFRESH_COOKIE, refreshCookieOptions());
    return { message: 'Đã đăng xuất' };
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  getProfile(@CurrentUser() user: AuthUser) {
    return user;
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change user password' })
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() changePasswordDto: ChangePasswordDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    // The new password ends every earlier session, this one included:
    // hand the caller a fresh one.
    const result = await this.authService.changePassword(
      user,
      changePasswordDto.oldPassword,
      changePasswordDto.newPassword,
    );
    setRefreshCookie(response, result.refresh_token);
    return {
      message: result.message,
      access_token: result.access_token,
      sessionExpiresAt: result.sessionExpiresAt,
    };
  }
}
