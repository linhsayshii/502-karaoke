import { Body, Controller, HttpCode, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { MANAGERS } from '../auth/roles';
import { ImportsService } from './imports.service';
import {
  ImportCategoriesDto,
  ImportProductsDto,
  ImportRoomsDto,
  ImportStockDto,
  ImportUsersDto,
} from './dto/import.dto';

// Excel import: the browser reads the sheet and maps its columns; these
// endpoints check the rows (dryRun) or write them all in one transaction.
@ApiTags('imports')
@ApiBearerAuth()
@Controller('imports')
@Roles(...MANAGERS)
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @Post('categories')
  @HttpCode(200)
  categories(
    @CurrentUser() user: AuthUser,
    @Query('branch') branch: string | undefined,
    @Body() dto: ImportCategoriesDto,
  ) {
    return this.imports.importCategories(user, branch, dto);
  }

  @Post('products')
  @HttpCode(200)
  products(
    @CurrentUser() user: AuthUser,
    @Query('branch') branch: string | undefined,
    @Body() dto: ImportProductsDto,
  ) {
    return this.imports.importProducts(user, branch, dto);
  }

  @Post('rooms')
  @HttpCode(200)
  rooms(
    @CurrentUser() user: AuthUser,
    @Query('branch') branch: string | undefined,
    @Body() dto: ImportRoomsDto,
  ) {
    return this.imports.importRooms(user, branch, dto);
  }

  @Post('users')
  @HttpCode(200)
  users(
    @CurrentUser() user: AuthUser,
    @Query('branch') branch: string | undefined,
    @Body() dto: ImportUsersDto,
  ) {
    return this.imports.importUsers(user, branch, dto);
  }

  @Post('stock-import')
  @HttpCode(200)
  stock(
    @CurrentUser() user: AuthUser,
    @Query('branch') branch: string | undefined,
    @Body() dto: ImportStockDto,
  ) {
    return this.imports.importStock(user, branch, dto);
  }
}
