import { ApiProperty } from '@nestjs/swagger';
import { RoomStatus } from '@prisma/client';
import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateRoomDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  // Rooms are VIP unless said otherwise (database default).
  @ApiProperty({ required: false, enum: ['VIP', 'NORMAL'], default: 'VIP' })
  @IsOptional()
  @IsIn(['VIP', 'NORMAL'])
  type?: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  pricePerHour: number;

  // ACTIVE is only set by opening a room session.
  @ApiProperty({ required: false, enum: ['AVAILABLE', 'MAINTENANCE'] })
  @IsOptional()
  @IsIn([RoomStatus.AVAILABLE, RoomStatus.MAINTENANCE])
  status?: RoomStatus;
}
