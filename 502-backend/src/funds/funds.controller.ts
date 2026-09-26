import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FundsService } from './funds.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { MANAGERS } from '../auth/roles';
import { CancelReasonDto } from '../common/dto/cancel-reason.dto';
import { DateRangeQuery } from '../inventory/dto/inventory-queries';
import { CreateFundTransactionDto } from './dto/create-fund-transaction.dto';
import { ListFundTransactionsQuery } from './dto/fund-queries';

@ApiTags('funds')
@ApiBearerAuth()
@Roles(...MANAGERS)
@Controller('funds')
export class FundsController {
  constructor(private readonly fundsService: FundsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: ListFundTransactionsQuery,
  ) {
    return this.fundsService.list(user, query);
  }

  @Get('summary')
  summary(@CurrentUser() user: AuthUser, @Query() query: DateRangeQuery) {
    return this.fundsService.summary(user, query);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Query('branch') branch: string | undefined,
    @Body() dto: CreateFundTransactionDto,
  ) {
    return this.fundsService.create(user, branch, dto);
  }

  // Manual entries only; bill receipts / import payments follow their source.
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelReasonDto,
  ) {
    return this.fundsService.cancel(user, id, dto.reason);
  }
}
