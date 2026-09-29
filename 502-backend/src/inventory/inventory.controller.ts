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
import { InventoryService } from './inventory.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { MANAGERS, READERS } from '../auth/roles';
import { CancelReasonDto } from '../common/dto/cancel-reason.dto';
import { withTotalCount } from '../common/total-count';
import { SharedRequestInterceptor } from '../common/shared-request.interceptor';
import { CreateStockDocumentDto } from './dto/create-stock-document.dto';
import {
  DateRangeQuery,
  ListDocumentsQuery,
  ListMovementsQuery,
} from './dto/inventory-queries';

@ApiTags('inventory')
@ApiBearerAuth()
@Roles(...READERS)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('stock')
  stock(@CurrentUser() user: AuthUser, @Query('branch') branch?: string) {
    return this.inventoryService.stock(user, branch);
  }

  // Import / export amounts of every document of the period (the Phiếu kho page).
  @Get('documents/summary')
  @UseInterceptors(SharedRequestInterceptor)
  documentsSummary(
    @CurrentUser() user: AuthUser,
    @Query() query: DateRangeQuery,
  ) {
    return this.inventoryService.documentsSummary(user, query);
  }

  // The newest 200; X-Total-Count says how many match.
  @Get('documents')
  listDocuments(
    @CurrentUser() user: AuthUser,
    @Query() query: ListDocumentsQuery,
    @Res({ passthrough: true }) res: Response,
  ) {
    return withTotalCount(
      res,
      this.inventoryService.listDocuments(user, query),
    );
  }

  @Get('documents/:id')
  getDocument(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.inventoryService.getDocument(user, id);
  }

  @Post('documents')
  @Roles(...MANAGERS)
  createDocument(
    @CurrentUser() user: AuthUser,
    @Query('branch') branch: string | undefined,
    @Body() dto: CreateStockDocumentDto,
  ) {
    return this.inventoryService.createDocument(user, branch, dto);
  }

  // Reverses the document's stock movements and its fund payment.
  @Post('documents/:id/cancel')
  @Roles(...MANAGERS)
  @HttpCode(HttpStatus.OK)
  cancelDocument(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelReasonDto,
  ) {
    return this.inventoryService.cancelDocument(user, id, dto.reason);
  }

  // The newest 500; X-Total-Count says how many match.
  @Get('movements')
  movements(
    @CurrentUser() user: AuthUser,
    @Query() query: ListMovementsQuery,
    @Res({ passthrough: true }) res: Response,
  ) {
    return withTotalCount(res, this.inventoryService.movements(user, query));
  }
}
