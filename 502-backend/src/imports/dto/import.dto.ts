import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { PaymentMethod, Role, StaffPosition } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

// Rows come from an Excel sheet already mapped to fields by the browser.
// Fields are optional here: a missing required value is reported on its row
// (action ERROR) instead of rejecting the whole file.

export const MAX_IMPORT_ROWS = 1000;

export enum OnDuplicate {
  SKIP = 'SKIP',
  UPDATE = 'UPDATE',
}

class ImportRow {
  @ApiProperty({ description: 'Số hàng trong file Excel' })
  @IsInt()
  @Min(1)
  row: number;
}

class ImportRequest {
  @ApiProperty({ description: 'true: chỉ kiểm tra, không ghi gì' })
  @IsBoolean()
  dryRun: boolean;
}

function rowsOf(type: () => new () => ImportRow) {
  return applyDecorators(
    ApiProperty({ type: () => [type()] }),
    IsArray(),
    ArrayMinSize(1),
    ArrayMaxSize(MAX_IMPORT_ROWS),
    ValidateNested({ each: true }),
    Type(type),
  );
}

// ---- categories -------------------------------------------------------------

export class CategoryImportRow extends ImportRow {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  name?: string;
}

export class ImportCategoriesDto extends ImportRequest {
  @rowsOf(() => CategoryImportRow)
  rows: CategoryImportRow[];
}

// ---- products ---------------------------------------------------------------

export class ProductImportRow extends ImportRow {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  categoryName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  trackStock?: boolean;
}

export class ImportProductsDto extends ImportRequest {
  @ApiProperty({ enum: OnDuplicate })
  @IsEnum(OnDuplicate)
  onDuplicate: OnDuplicate;

  @ApiProperty({ description: 'Tạo danh mục chưa có' })
  @IsBoolean()
  createCategories: boolean;

  @rowsOf(() => ProductImportRow)
  rows: ProductImportRow[];
}

// ---- rooms ------------------------------------------------------------------

export class RoomImportRow extends ImportRow {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ required: false, enum: ['VIP', 'NORMAL'] })
  @IsOptional()
  @IsIn(['VIP', 'NORMAL'])
  type?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  pricePerHour?: number;
}

export class ImportRoomsDto extends ImportRequest {
  @ApiProperty({ enum: OnDuplicate })
  @IsEnum(OnDuplicate)
  onDuplicate: OnDuplicate;

  @rowsOf(() => RoomImportRow)
  rows: RoomImportRow[];
}

// ---- accounts -----------------------------------------------------------------

export class UserImportRow extends ImportRow {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  fullName?: string;

  @ApiProperty({ required: false, description: 'Bỏ trống để tự sinh' })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ required: false, enum: StaffPosition })
  @IsOptional()
  @IsEnum(StaffPosition)
  position?: StaffPosition;

  @ApiProperty({ required: false, enum: Role })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}

export class ImportUsersDto extends ImportRequest {
  @ApiProperty({ enum: OnDuplicate })
  @IsEnum(OnDuplicate)
  onDuplicate: OnDuplicate;

  @rowsOf(() => UserImportRow)
  rows: UserImportRow[];
}

// ---- phiếu nhập kho -------------------------------------------------------------

export class StockImportRow extends ImportRow {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  productName?: string;

  @ApiProperty({ required: false, minimum: 1 })
  @IsOptional()
  @IsInt()
  quantity?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  unitCost?: number;

  // Only used to create a product that does not exist yet.
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  categoryName?: string;
}

export class ImportStockDto extends ImportRequest {
  @ApiProperty({ description: 'Tạo sản phẩm (và danh mục) chưa có' })
  @IsBoolean()
  createProducts: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  supplier?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiProperty({ required: false, enum: PaymentMethod })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @rowsOf(() => StockImportRow)
  rows: StockImportRow[];
}
