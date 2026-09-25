import {
  Body,
  Controller,
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
import { CreateOrderDto } from './dto/create-order.dto';
import { FindOrdersQueryDto } from './dto/find-orders-query.dto';
import { OrderResponseDto } from './dto/order-response.dto';
import { PaginatedOrdersResponseDto } from './dto/paginated-orders-response.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrdersService } from './orders.service';

const ORDER_ID_PARAM = {
  name: 'id',
  description: 'Order UUID.',
  example: 'cae376cf-1216-49aa-a6df-9948c211e4af',
};

@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @ApiOperation({
    summary: 'Create an order',
    description:
      'Creates an order in PENDING and reserves stock (an OUT movement) for every item, ' +
      'all inside one database transaction. If any item lacks enough stock, the ' +
      'UnprocessableEntityException from that item aborts the whole transaction — the ' +
      "order, every OrderItem, and any OUT movements already applied for earlier items " +
      'in the loop are all rolled back together. Each item copies the product\'s current ' +
      'price into unitPrice.',
  })
  @ApiBody({
    type: CreateOrderDto,
    examples: {
      default: {
        summary: 'Two-item order',
        value: {
          customerName: 'Juan Pérez',
          address: 'Av. Corrientes 1234, CABA',
          items: [
            { productId: '3fa85f64-5717-4562-b3fc-2c963f66afa6', quantity: 2 },
            { productId: '61aeecde-8942-40e9-86dd-fe5e3211f9ae', quantity: 1 },
          ],
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Order created and stock reserved.', type: OrderResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Validation failed (empty items array, non-UUID productId, non-positive quantity, or customerName with no letters).',
  })
  @ApiResponse({ status: 404, description: 'One of the items references a product that does not exist or is soft-deleted.' })
  @ApiResponse({
    status: 422,
    description: 'One of the items requests more quantity than the product currently has in stock — the entire order is rolled back, nothing is created.',
  })
  create(@Body() dto: CreateOrderDto): Promise<OrderResponseDto> {
    return this.ordersService.create(dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List orders',
    description: 'Returns a paginated list of orders, optionally filtered by status, newest first.',
  })
  @ApiQuery({ name: 'status', required: false, enum: ['PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED'], description: 'Filter by order status.' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number, 1-indexed.', example: 1 })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, description: 'Items per page (max 100).', example: 10 })
  @ApiResponse({ status: 200, description: 'Paginated list of orders.', type: PaginatedOrdersResponseDto })
  @ApiResponse({ status: 400, description: 'status/page/pageSize failed validation.' })
  findAll(@Query() query: FindOrdersQueryDto) {
    return this.ordersService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get an order by id',
    description: 'Returns the order with its items, each including basic product info (id, sku, name).',
  })
  @ApiParam(ORDER_ID_PARAM)
  @ApiResponse({ status: 200, description: 'Order found.', type: OrderResponseDto })
  @ApiResponse({ status: 400, description: 'id is not a valid UUID.' })
  @ApiResponse({ status: 404, description: 'No order with this id.' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<OrderResponseDto> {
    return this.ordersService.findOne(id);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary: 'Transition an order to a new status',
    description:
      'Valid transitions: PENDING → CONFIRMED or CANCELLED; CONFIRMED → SHIPPED or ' +
      'CANCELLED; SHIPPED → DELIVERED. DELIVERED and CANCELLED are terminal — nothing can ' +
      'leave them. Cancelling from PENDING or CONFIRMED restocks every item (an IN ' +
      'movement per item) in the same transaction as the status change. Any transition ' +
      'not in this list is rejected with 409, naming the attempted from/to states.',
  })
  @ApiParam(ORDER_ID_PARAM)
  @ApiBody({
    type: UpdateOrderStatusDto,
    examples: {
      confirm: { summary: 'Confirm a pending order', value: { status: 'CONFIRMED' } },
      cancel: { summary: 'Cancel and restock', value: { status: 'CANCELLED' } },
    },
  })
  @ApiResponse({ status: 200, description: 'Status updated.', type: OrderResponseDto })
  @ApiResponse({ status: 400, description: 'id is not a valid UUID, or status is not a valid OrderStatus value.' })
  @ApiResponse({ status: 404, description: 'No order with this id.' })
  @ApiResponse({
    status: 409,
    description: 'The requested transition is not allowed from the order\'s current status (e.g. PENDING → DELIVERED, or cancelling a SHIPPED order).',
  })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrderStatusDto,
  ): Promise<OrderResponseDto> {
    return this.ordersService.updateStatus(id, dto);
  }
}
