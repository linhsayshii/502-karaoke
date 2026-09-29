import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { MANAGERS, SALES, READERS } from '../auth/roles';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ListUsersQuery } from './dto/list-users.query';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('floor-staff')
  @Roles(...SALES)
  floorStaff(@CurrentUser() user: AuthUser, @Query('branch') branch?: string) {
    return this.usersService.floorStaff(user, branch);
  }

  @Get()
  @Roles(...READERS)
  list(@CurrentUser() user: AuthUser, @Query() query: ListUsersQuery) {
    return this.usersService.list(user, query);
  }

  @Post()
  @Roles(...MANAGERS)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateUserDto) {
    return this.usersService.create(user, dto);
  }

  @Patch(':id')
  @Roles(...MANAGERS)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.update(user, id, dto);
  }

  @Post(':id/reset-password')
  @HttpCode(HttpStatus.OK)
  @Roles(...MANAGERS)
  resetPassword(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResetPasswordDto,
  ) {
    return this.usersService.resetPassword(user, id, dto.password);
  }

  // Accounts are never hard-deleted (orders reference them); this locks it.
  @Delete(':id')
  @Roles(...MANAGERS)
  deactivate(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.usersService.deactivate(user, id);
  }
}
