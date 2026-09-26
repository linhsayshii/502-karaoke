import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional } from 'class-validator';

// Opens a room session. The branch comes from the room.
export class CreateOrderDto {
  @ApiProperty()
  @IsInt()
  roomId: number;

  @ApiProperty({ required: false, description: 'Nhân viên CSKH' })
  @IsOptional()
  @IsInt()
  cskhId?: number | null;

  @ApiProperty({ required: false, description: 'Nhân viên phục vụ' })
  @IsOptional()
  @IsInt()
  serverId?: number | null;
}
