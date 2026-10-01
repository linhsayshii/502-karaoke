import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { BUYER_TAX_CODE_RE, VAT_RATES, type VatRate } from '../einvoice-types';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MESSAGE = 'Ngày phải có dạng YYYY-MM-DD';
const BILL_NUMBER_RE = /^\d{1,15}$/;
// Thông tư 78/2021: an invoice number has at most 8 digits.
const MAX_INVOICE_NUMBER = 99_999_999;
const INVOICE_NUMBER_MESSAGE = 'Số hóa đơn có tối đa 8 chữ số';

export class EinvoiceLineDto {
  @ApiProperty({ maxLength: 300 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  name: string;

  @ApiProperty({ maxLength: 30 })
  @IsString()
  @MaxLength(30)
  unit: string;

  @ApiProperty()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  @Max(1_000_000)
  quantity: number;

  @ApiProperty({ description: 'Đơn giá trước VAT, đồng' })
  @IsInt()
  @Min(0)
  @Max(100_000_000_000)
  unitPrice: number;

  @ApiProperty({ enum: VAT_RATES })
  @IsIn(VAT_RATES)
  vatRate: VatRate;

  @ApiProperty({
    required: false,
    description: 'Chỉ dòng bù: tiền thuế lệch tối đa 1 đồng',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  vatAmount?: number;
}

// The whole draft: PATCH replaces it (like the items of an order).
export class EinvoiceDraftDto {
  @ApiProperty({
    description: 'Số tiền đã gồm VAT, đồng; nháp được để 0, xuất thì cần ≥ 1',
  })
  @IsInt()
  @Min(0)
  @Max(100_000_000_000)
  amount: number;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @ValidateIf((dto: EinvoiceDraftDto) => !!dto.buyerTaxCode)
  @Matches(BUYER_TAX_CODE_RE, {
    message: 'MST người mua phải có 10 số, 10 số kèm -3 số, hoặc 12 số',
  })
  buyerTaxCode?: string | null;

  @ApiProperty({ required: false, nullable: true, maxLength: 400 })
  @IsOptional()
  @IsString()
  @MaxLength(400)
  buyerName?: string | null;

  @ApiProperty({ required: false, nullable: true, maxLength: 400 })
  @IsOptional()
  @IsString()
  @MaxLength(400)
  buyerAddress?: string | null;

  @ApiProperty({ required: false, nullable: true, maxLength: 200 })
  @IsOptional()
  @ValidateIf((dto: EinvoiceDraftDto) => !!dto.buyerEmail)
  @IsEmail({}, { message: 'Email người mua không hợp lệ' })
  @MaxLength(200)
  buyerEmail?: string | null;

  @ApiProperty({ type: [EinvoiceLineDto] })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => EinvoiceLineDto)
  lines: EinvoiceLineDto[];
}

export class CreateEinvoiceDto extends EinvoiceDraftDto {
  @ApiProperty({ description: 'Bill đã thanh toán' })
  @IsInt()
  orderId: number;
}

export class EinvoiceListQuery {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  branch?: string;

  @ApiProperty({
    required: false,
    enum: ['DRAFT', 'ERROR', 'UNCERTAIN', 'ISSUED'],
  })
  @IsOptional()
  @IsIn(['DRAFT', 'ERROR', 'UNCERTAIN', 'ISSUED'])
  status?: 'DRAFT' | 'ERROR' | 'UNCERTAIN' | 'ISSUED';

  @ApiProperty({ required: false, description: 'Từ ngày kinh doanh của bill' })
  @IsOptional()
  @Matches(DATE_RE, { message: DATE_MESSAGE })
  from?: string;

  @ApiProperty({ required: false, description: 'Đến ngày kinh doanh của bill' })
  @IsOptional()
  @Matches(DATE_RE, { message: DATE_MESSAGE })
  to?: string;

  @ApiProperty({
    required: false,
    description: 'Tìm theo đầu số bill, mọi ngày',
  })
  @IsOptional()
  @Matches(BILL_NUMBER_RE, { message: 'Số bill chỉ gồm chữ số' })
  billNumber?: string;
}

export class EinvoiceBillsQuery {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  branch?: string;

  @ApiProperty({
    required: false,
    description: 'Ngày kinh doanh; mặc định hôm nay',
  })
  @IsOptional()
  @Matches(DATE_RE, { message: DATE_MESSAGE })
  businessDate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @Matches(BILL_NUMBER_RE, { message: 'Số bill chỉ gồm chữ số' })
  billNumber?: string;
}

export class IssueEinvoiceDto {
  @ApiProperty({ description: 'Ngày hóa đơn YYYY-MM-DD' })
  @Matches(DATE_RE, { message: DATE_MESSAGE })
  invoiceDate: string;

  @ApiProperty({
    required: false,
    description: 'Bắt buộc khi ngày hóa đơn sau hôm nay',
  })
  @IsOptional()
  @IsBoolean()
  confirmFutureDate?: boolean;
}

export class ResolveEinvoiceDto {
  @ApiProperty({ description: 'true: hóa đơn đã có trên Minvoice' })
  @IsBoolean()
  found: boolean;

  @ApiProperty({
    required: false,
    description: 'Số hóa đơn trên Minvoice, khi found',
  })
  @ValidateIf((dto: ResolveEinvoiceDto) => dto.found)
  @IsInt()
  @Min(1)
  @Max(MAX_INVOICE_NUMBER, { message: INVOICE_NUMBER_MESSAGE })
  invoiceNumber?: number;
}

export class EinvoiceNumberDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  @Max(MAX_INVOICE_NUMBER, { message: INVOICE_NUMBER_MESSAGE })
  invoiceNumber: number;
}
