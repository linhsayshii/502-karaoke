import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthUser } from '../auth/auth-user';
import { CHAIN_ONLY, EINVOICE_READERS, EINVOICE_WRITERS } from '../auth/roles';
import {
  EinvoiceBranchQuery,
  MinvoiceLoginDto,
  SelectSymbolDto,
  SymbolsQuery,
} from './dto/config.dto';
import { EinvoiceConfigService } from './einvoice-config.service';
import { TaxPayerService } from './tax-payer.service';

@ApiTags('einvoice')
@ApiBearerAuth()
@Controller('einvoice')
export class EinvoiceConfigController {
  constructor(
    private readonly config: EinvoiceConfigService,
    private readonly taxPayers: TaxPayerService,
  ) {}

  @Get('config')
  @Roles(...EINVOICE_READERS)
  view(@CurrentUser() user: AuthUser, @Query() query: EinvoiceBranchQuery) {
    return this.config.view(user, query.branch);
  }

  @Post('config/login')
  @HttpCode(200)
  @Roles(...CHAIN_ONLY)
  login(
    @CurrentUser() user: AuthUser,
    @Query() query: EinvoiceBranchQuery,
    @Body() dto: MinvoiceLoginDto,
  ) {
    return this.config.login(user, query.branch, dto);
  }

  @Get('config/symbols')
  @Roles(...CHAIN_ONLY)
  symbols(@CurrentUser() user: AuthUser, @Query() query: SymbolsQuery) {
    return this.config.symbols(user, query.branch, query.year);
  }

  @Put('config/symbol')
  @Roles(...CHAIN_ONLY)
  selectSymbol(
    @CurrentUser() user: AuthUser,
    @Query() query: EinvoiceBranchQuery,
    @Body() dto: SelectSymbolDto,
  ) {
    return this.config.selectSymbol(user, query.branch, dto);
  }

  @Get('tax-payers/:taxCode')
  @Roles(...EINVOICE_WRITERS)
  taxPayer(@Param('taxCode') taxCode: string) {
    return this.taxPayers.lookup(taxCode);
  }
}
