import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

// Voiding something that already moved money or stock needs a reason.
export class CancelReasonDto {
  @ApiProperty({ description: 'Lý do hủy', maxLength: 500 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
