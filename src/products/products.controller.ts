import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CreateProductDto } from './dto/create-product.dto';
import { FindProductsQueryDto } from './dto/find-products-query.dto';
import { PaginatedProductsResponseDto } from './dto/paginated-products-response.dto';
import { ProductHistoryResponseDto } from './dto/product-history-response.dto';
import { ProductResponseDto } from './dto/product-response.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsService } from './products.service';

const PRODUCT_ID_PARAM = {
  name: 'id',
  description: 'Product UUID.',
  example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
};

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a product',
    description:
      'Creates a product with stock 0 and records a CREATE entry in its history. ' +
      'Rejected with 409 if another active product (available: true) already has the ' +
      'same name — the check runs before insert, and the underlying partial unique ' +
      'index (ux_product_active_name) is caught as a race-condition safety net.',
  })
  @ApiBody({
    type: CreateProductDto,
    examples: {
      default: {
        summary: 'New headphones',
        value: {
          name: 'Auricular Bluetooth XYZ',
          sku: 'SKU-AUR-001',
          description: 'Auriculares inalámbricos con cancelación de ruido activa.',
          price: 25999.9,
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Product created.', type: ProductResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Validation failed (missing/invalid field, or an extra field not in the DTO).',
  })
  @ApiResponse({
    status: 409,
    description: 'Another active product already uses this name.',
  })
  create(@Body() dto: CreateProductDto): Promise<ProductResponseDto> {
    return this.productsService.create(dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List active products',
    description: 'Returns a paginated list of active products (available: true), newest first.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number, 1-indexed.', example: 1 })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, description: 'Items per page (max 100).', example: 10 })
  @ApiResponse({ status: 200, description: 'Paginated list of products.', type: PaginatedProductsResponseDto })
  @ApiResponse({ status: 400, description: 'page/pageSize out of allowed range or not an integer.' })
  findAll(@Query() query: FindProductsQueryDto) {
    return this.productsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a product by id',
    description: 'Returns a single active product. A soft-deleted product behaves as not found.',
  })
  @ApiParam(PRODUCT_ID_PARAM)
  @ApiResponse({ status: 200, description: 'Product found.', type: ProductResponseDto })
  @ApiResponse({ status: 400, description: 'id is not a valid UUID.' })
  @ApiResponse({ status: 404, description: 'No active product with this id (never existed, or soft-deleted).' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<ProductResponseDto> {
    return this.productsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a product',
    description:
      'Updates the given fields and, if anything actually changed, records an UPDATE ' +
      'history entry as { field: { from, to } } — all inside one transaction. Renaming to ' +
      "another active product's name is rejected with 409, same rule as create.",
  })
  @ApiParam(PRODUCT_ID_PARAM)
  @ApiBody({
    type: UpdateProductDto,
    examples: {
      default: {
        summary: 'Price update',
        value: { price: 27999.9 },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Product updated.', type: ProductResponseDto })
  @ApiResponse({ status: 400, description: 'Validation failed on one of the provided fields.' })
  @ApiResponse({ status: 404, description: 'No active product with this id.' })
  @ApiResponse({ status: 409, description: 'Another active product already uses the new name.' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ): Promise<ProductResponseDto> {
    return this.productsService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Soft-delete a product',
    description:
      'Sets available: false and records a DELETE history entry. Never a physical DELETE — ' +
      'the row and its full history remain in the database.',
  })
  @ApiParam(PRODUCT_ID_PARAM)
  @ApiResponse({ status: 200, description: 'Product soft-deleted.', type: ProductResponseDto })
  @ApiResponse({ status: 400, description: 'id is not a valid UUID.' })
  @ApiResponse({ status: 404, description: 'No active product with this id (already deleted, or never existed).' })
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<ProductResponseDto> {
    return this.productsService.remove(id);
  }

  @Get(':id/history')
  @ApiOperation({
    summary: 'Get a product\'s audit history',
    description:
      'Returns every CREATE/UPDATE/DELETE entry for this product, newest first. Unlike ' +
      'every other endpoint on this resource, this one does NOT treat a soft-deleted ' +
      'product as not found — the audit trail must stay readable after deletion.',
  })
  @ApiParam(PRODUCT_ID_PARAM)
  @ApiResponse({ status: 200, description: 'History entries, newest first.', type: [ProductHistoryResponseDto] })
  @ApiResponse({ status: 400, description: 'id is not a valid UUID.' })
  @ApiResponse({ status: 404, description: 'No product with this id has ever existed.' })
  getHistory(@Param('id', ParseUUIDPipe) id: string): Promise<ProductHistoryResponseDto[]> {
    return this.productsService.getHistory(id);
  }
}
