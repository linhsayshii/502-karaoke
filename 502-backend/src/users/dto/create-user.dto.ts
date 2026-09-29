import { ApiProperty } from '@nestjs/swagger';
import { Role, StaffPosition } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ description: 'Chữ thường, số, dấu chấm, gạch dưới' })
  @Matches(/^[a-z0-9._]{3,32}$/)
  username: string;

  @ApiProperty({ required: false, minLength: 6 })
  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  fullName: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ enum: Role })
  @IsEnum(Role)
  role: Role;

  @ApiProperty({ enum: StaffPosition, required: false, nullable: true })
  @IsOptional()
  @IsEnum(StaffPosition)
  position?: StaffPosition | null;

  @ApiProperty({
    required: false,
    description: 'Quản lý PR/KTV: sửa danh sách và điểm danh PR/KTV',
  })
  @IsOptional()
  @IsBoolean()
  managesPr?: boolean;

  @ApiProperty({
    required: false,
    description:
      'Bỏ trống với quản lý cao nhất; quản lý cơ sở luôn là cơ sở của mình',
  })
  @IsOptional()
  @IsInt()
  branchId?: number | null;
}
