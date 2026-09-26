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
import { InventoryService } from './inventory.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { MANAGERS } from '../auth/roles';
import { CancelReasonDto } from '../common/dto/cancel-reason.dto';
import { CreateStockDocumentDto } from './dto/create-stock-document.dto';
import {
  ListDocumentsQuery,
  ListMovementsQuery,
} from './dto/inventory-queries';

@ApiTags('inventory')
@ApiBearerAuth()
@Roles(...MANAGERS)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('stock')
  stock(@CurrentUser() user: AuthUser, @Query('branch') branch?: string) {
    return this.inventoryService.stock(user, branch);
  }

  @Get('documents')
  listDocuments(
    @CurrentUser() user: AuthUser,
    @Query() query: ListDocumentsQuery,
  ) {
    return this.inventoryService.listDocuments(user, query);
  }

  @Get('documents/:id')
  getDocument(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.inventoryService.getDocument(user, id);
  }

  @Post('documents')
  createDocument(
    @CurrentUser() user: AuthUser,
    @Query('branch') branch: string | undefined,
    @Body() dto: CreateStockDocumentDto,
  ) {
    return this.inventoryService.createDocument(user, branch, dto);
  }

  // Reverses the document's stock movements and its fund payment.
  @Post('documents/:id/cancel')
  @HttpCode(HttpStatus.OK)
  cancelDocument(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelReasonDto,
  ) {
    return this.inventoryService.cancelDocument(user, id, dto.reason);
  }

  @Get('movements')
  movements(@CurrentUser() user: AuthUser, @Query() query: ListMovementsQuery) {
    return this.inventoryService.movements(user, query);
  }
}
