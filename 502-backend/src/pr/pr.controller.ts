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
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { EVERY_ROLE } from '../auth/roles';
import { withTotalCount } from '../common/total-count';
import { PrService } from './pr.service';
import { PrSessionsService } from './pr-sessions.service';
import {
  CreatePrStaffDto,
  ListPrStaffQuery,
  UpdatePrStaffDto,
} from './dto/pr-staff.dto';
import {
  CheckInDto,
  ListAttendanceQuery,
  UpdateAttendanceDto,
} from './dto/pr-attendance.dto';
import {
  AddPrSessionDto,
  PrBranchQuery,
  UpdatePrSessionDto,
} from './dto/pr-session.dto';

// PR/KTV list, roll call and visits in rooms. Open to every role here because
// the right comes from the account's "Quản lý PR/KTV" flag as well as its role;
// PrService and PrSessionsService check it (canManagePr / canViewPr, and
// canAssignPr for putting PR/KTV into a room).
@ApiTags('pr')
@ApiBearerAuth()
@Roles(...EVERY_ROLE)
@Controller('pr')
export class PrController {
  constructor(
    private readonly prService: PrService,
    private readonly sessions: PrSessionsService,
  ) {}

  @Get('staff')
  listStaff(
    @CurrentUser() user: AuthUser,
    @Query() query: ListPrStaffQuery,
    @Res({ passthrough: true }) res: Response,
  ) {
    return withTotalCount(res, this.prService.listStaff(user, query));
  }

  @Post('staff')
  createStaff(
    @CurrentUser() user: AuthUser,
    @Query('branch') branch: string | undefined,
    @Body() dto: CreatePrStaffDto,
  ) {
    return this.prService.createStaff(user, branch, dto);
  }

  @Patch('staff/:id')
  updateStaff(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePrStaffDto,
  ) {
    return this.prService.updateStaff(user, id, dto);
  }

  @Delete('staff/:id')
  removeStaff(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.prService.removeStaff(user, id);
  }

  @Get('attendance')
  listAttendance(
    @CurrentUser() user: AuthUser,
    @Query() query: ListAttendanceQuery,
    @Res({ passthrough: true }) res: Response,
  ) {
    return withTotalCount(res, this.prService.listAttendance(user, query));
  }

  @Post('attendance')
  checkIn(@CurrentUser() user: AuthUser, @Body() dto: CheckInDto) {
    return this.prService.checkIn(user, dto);
  }

  @Post('attendance/:id/check-out')
  @HttpCode(HttpStatus.OK)
  checkOut(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.prService.checkOut(user, id);
  }

  @Patch('attendance/:id')
  updateAttendance(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAttendanceDto,
  ) {
    return this.prService.updateAttendance(user, id, dto);
  }

  @Delete('attendance/:id')
  removeAttendance(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.prService.removeAttendance(user, id);
  }

  @Get('available')
  available(
    @CurrentUser() user: AuthUser,
    @Query() query: PrBranchQuery,
    @Res({ passthrough: true }) res: Response,
  ) {
    return withTotalCount(res, this.sessions.available(user, query.branch));
  }

  @Post('sessions')
  addSession(@CurrentUser() user: AuthUser, @Body() dto: AddPrSessionDto) {
    return this.sessions.add(user, dto);
  }

  @Post('sessions/:id/end')
  @HttpCode(HttpStatus.OK)
  endSession(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.sessions.end(user, id);
  }

  @Patch('sessions/:id')
  updateSession(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePrSessionDto,
  ) {
    return this.sessions.update(user, id, dto);
  }

  @Delete('sessions/:id')
  removeSession(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.sessions.remove(user, id);
  }
}
