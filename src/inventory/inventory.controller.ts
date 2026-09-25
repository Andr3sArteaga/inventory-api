import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CreateMovementDto } from './dto/create-movement.dto';
import { FindMovementsQueryDto } from './dto/find-movements-query.dto';
import { MovementResponseDto } from './dto/movement-response.dto';
import { PaginatedMovementsResponseDto } from './dto/paginated-movements-response.dto';
import { InventoryService } from './inventory.service';

@ApiTags('inventory')
@Controller('inventory/movements')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post()
  @ApiOperation({
    summary: 'Register a manual stock movement',
    description:
      'Applies IN (adds) or OUT (subtracts) to a product\'s stock atomically with the ' +
      'movement record itself — a single UPDATE ... WHERE stock >= quantity, not a ' +
      'read-then-write, so concurrent requests on the same product can never drive stock ' +
      'negative. This endpoint never accepts orderId: manual movements are never tied to ' +
      'an order (only orders.service assigns that internally).',
  })
  @ApiResponse({ status: 201, description: 'Movement applied and stock updated.', type: MovementResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Validation failed (e.g. quantity not a positive integer, or orderId was sent).',
  })
  @ApiResponse({ status: 404, description: 'Product does not exist, or is soft-deleted (available: false).' })
  @ApiResponse({
    status: 422,
    description: 'type is OUT and applying it would leave stock negative — nothing was changed.',
  })
  create(@Body() dto: CreateMovementDto): Promise<MovementResponseDto> {
    return this.inventoryService.create(dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List stock movements',
    description: 'Returns a paginated, filterable audit trail of every stock movement (manual, reservation, or restock), newest first.',
  })
  @ApiQuery({ name: 'productId', required: false, description: 'Filter by product.', example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  @ApiQuery({ name: 'orderId', required: false, description: 'Filter by order.', example: 'cae376cf-1216-49aa-a6df-9948c211e4af' })
  @ApiQuery({ name: 'type', required: false, enum: ['IN', 'OUT'], description: 'Filter by movement direction.' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number, 1-indexed.', example: 1 })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, description: 'Items per page (max 100).', example: 10 })
  @ApiResponse({ status: 200, description: 'Paginated list of movements.', type: PaginatedMovementsResponseDto })
  @ApiResponse({ status: 400, description: 'A filter or pagination param failed validation.' })
  findAll(@Query() query: FindMovementsQueryDto) {
    return this.inventoryService.findAll(query);
  }
}
