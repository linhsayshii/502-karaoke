import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
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
  purge(@CurrentUser() user: AuthUser, @Body() dto: PurgeDataDto) {
    return this.service.purge(user, dto);
  }
}
