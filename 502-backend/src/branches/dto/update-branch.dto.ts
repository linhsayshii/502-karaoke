import { ApiProperty, OmitType, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateBranchDto } from './create-branch.dto';

// The code is part of every URL and cannot be changed.
export class UpdateBranchDto extends PartialType(
  OmitType(CreateBranchDto, ['code'] as const),
) {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
