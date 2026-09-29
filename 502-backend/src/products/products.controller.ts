import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { Role } from '@prisma/client';
import { MANAGERS, SALES_READERS } from '../auth/roles';

@ApiTags('products')
@ApiBearerAuth()
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @Roles(...MANAGERS)
  create(
    @CurrentUser() user: AuthUser,
    @Query('branch') branch: string | undefined,
    @Body() dto: CreateProductDto,
  ) {
    return this.productsService.create(user, branch, dto);
  }

  // Floor staff: the menu of their branch for the room they serve (loaded once per room page, never polled).
  @Get()
  @Roles(...SALES_READERS, Role.STAFF)
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('branch') branch?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.productsService.findAll(
      user,
      branch,
      includeInactive === 'true',
    );
  }

  // Floor staff: see the note on GET /products.
  @Get(':id')
  @Roles(...SALES_READERS, Role.STAFF)
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.productsService.findOne(user, id);
  }

  @Patch(':id')
  @Roles(...MANAGERS)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productsService.update(user, id, dto);
  }

  @Delete(':id')
  @Roles(...MANAGERS)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.productsService.remove(user, id);
  }
}
