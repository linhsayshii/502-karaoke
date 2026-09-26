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
import { MANAGERS, SALES } from '../auth/roles';

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

  @Get()
  @Roles(...SALES)
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

  @Get(':id')
  @Roles(...SALES)
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
