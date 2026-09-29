import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { ALL_BRANCH_ROLES } from '../auth/roles';
import { DataPurgeService } from './data-purge.service';
import { PurgeDataDto } from './purge.dto';

@ApiTags('data-purge')
@ApiBearerAuth()
@Controller('admin/purge')
export class DataPurgeController {
  constructor(private service: DataPurgeService) {}

  @Post()
  @Roles(Role.BOARD)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'HĐQT: xóa sạch dữ liệu một cơ sở hoặc cả hệ thống (cần mật khẩu)',
  })
  purge(
    @CurrentUser() user: AuthUser,
    @Body() dto: PurgeDataDto,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.service.purge(user, dto, userAgent);
  }

  @Get('logs')
  @Roles(...ALL_BRANCH_ROLES)
  @ApiOperation({ summary: 'Nhật ký xóa dữ liệu (500 lần gần nhất)' })
  logs() {
    return this.service.logs();
  }
}
