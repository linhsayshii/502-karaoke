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
  Res,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FundsService } from './funds.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { MANAGERS, READERS } from '../auth/roles';
import { CancelReasonDto } from '../common/dto/cancel-reason.dto';
import { SharedRequestInterceptor } from '../common/shared-request.interceptor';
import { withTotalCount } from '../common/total-count';
import { DateRangeQuery } from '../inventory/dto/inventory-queries';
import { CreateFundTransactionDto } from './dto/create-fund-transaction.dto';
import { ListFundTransactionsQuery } from './dto/fund-queries';

@ApiTags('funds')
@ApiBearerAuth()
@Roles(...READERS)
@Controller('funds')
export class FundsController {
  constructor(private readonly fundsService: FundsService) {}

  // The newest 500; X-Total-Count says how many match.
  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: ListFundTransactionsQuery,
    @Res({ passthrough: true }) res: Response,
  ) {
    return withTotalCount(res, this.fundsService.list(user, query));
  }

  @Get('summary')
  @UseInterceptors(SharedRequestInterceptor)
  summary(@CurrentUser() user: AuthUser, @Query() query: DateRangeQuery) {
    return this.fundsService.summary(user, query);
  }

  @Post()
  @Roles(...MANAGERS)
  create(
    @CurrentUser() user: AuthUser,
    @Query('branch') branch: string | undefined,
    @Body() dto: CreateFundTransactionDto,
  ) {
    return this.fundsService.create(user, branch, dto);
  }

  // Manual entries only; bill receipts / import payments follow their source.
  @Post(':id/cancel')
  @Roles(...MANAGERS)
  @HttpCode(HttpStatus.OK)
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelReasonDto,
  ) {
    return this.fundsService.cancel(user, id, dto.reason);
  }
}
