import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoomsService } from './rooms.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { MANAGERS } from '../auth/roles';

@ApiTags('rooms')
@ApiBearerAuth()
@Controller('rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Post()
  @Roles(...MANAGERS)
  create(
    @CurrentUser() user: AuthUser,
    @Query('branch') branch: string | undefined,
    @Body() createRoomDto: CreateRoomDto,
  ) {
    return this.roomsService.create(user, branch, createRoomDto);
  }

  // All roles; staff get only the rooms they serve.
  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query('branch') branch?: string) {
    return this.roomsService.findAll(user, branch);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.roomsService.findOne(user, id);
  }

  @Patch(':id')
  @Roles(...MANAGERS)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() updateRoomDto: UpdateRoomDto,
  ) {
    return this.roomsService.update(user, id, updateRoomDto);
  }

  @Delete(':id')
  @Roles(...MANAGERS)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.roomsService.remove(user, id);
  }
}
