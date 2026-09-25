import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { MovementType, OrderStatus } from '../generated/prisma/enums';
import { InventoryService } from '../inventory/inventory.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { FindOrdersQueryDto } from './dto/find-orders-query.dto';
import { OrderResponseDto } from './dto/order-response.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';

// decision: valid transitions as a lookup table instead of an if/else chain. Checking
// "is X -> Y legal" becomes ORDER_STATUS_TRANSITIONS[X].includes(Y) — one line, and the
// full state machine is readable in one place instead of scattered across conditionals
// that would need to be read start-to-end to be trusted.
const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  [OrderStatus.CONFIRMED]: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
  [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED],
  [OrderStatus.DELIVERED]: [],
  [OrderStatus.CANCELLED]: [],
};

const ORDER_INCLUDE = {
  items: {
    include: {
      product: { select: { id: true, sku: true, name: true } },
    },
  },
} as const;

type OrderWithItems = Prisma.OrderGetPayload<{ include: typeof ORDER_INCLUDE }>;

// decision: unitPrice comes back from Prisma as a Decimal, same reason
// ProductResponseDto stringifies price — JSON-serializing a Decimal loses none of its
// precision either way (Decimal.js's toJSON already returns a string), but this mapper
// makes that conversion explicit at the type level instead of relying on it happening
// implicitly during response serialization.
function toOrderResponse(order: OrderWithItems): OrderResponseDto {
  return {
    id: order.id,
    customerName: order.customerName,
    address: order.address,
    status: order.status,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    items: order.items.map((item) => ({
      id: item.id,
      orderId: item.orderId,
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: item.unitPrice.toString(),
      product: item.product,
    })),
  };
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
  ) {}

  async create(dto: CreateOrderDto): Promise<OrderResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      const products = await tx.product.findMany({
        where: {
          id: { in: dto.items.map((item) => item.productId) },
          available: true,
        },
      });
      const productsById = new Map(products.map((product) => [product.id, product]));

      for (const item of dto.items) {
        if (!productsById.has(item.productId)) {
          throw new NotFoundException(`Product ${item.productId} not found`);
        }
      }

      const order = await tx.order.create({
        data: {
          customerName: dto.customerName,
          address: dto.address,
          status: OrderStatus.PENDING,
          items: {
            create: dto.items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: productsById.get(item.productId)!.price,
            })),
          },
        },
      });

      // decision: this is the part that has to be airtight. `tx` is the Prisma
      // TransactionClient this whole callback is running on. Passing it as the last
      // argument to applyMovement (see inventory.service.ts) makes it run its
      // validate-then-write directly on THIS connection/transaction instead of opening
      // its own — there's no separate commit in between. If item 3 of 3 doesn't have
      // enough stock, applyMovement throws UnprocessableEntityException from inside
      // this same tx; Prisma's interactive transaction catches that, rolls back the
      // whole thing, and the exception propagates out of $transaction() to Nest's
      // exception filter. Net effect: the order row, every OrderItem, and the OUT
      // movements already created for items 1-2 all disappear together. Nothing is
      // ever left half-applied.
      for (const item of dto.items) {
        await this.inventoryService.applyMovement(
          item.productId,
          MovementType.OUT,
          item.quantity,
          `Reserve for order ${order.id}`,
          order.id,
          tx,
        );
      }

      const created = await tx.order.findUniqueOrThrow({
        where: { id: order.id },
        include: ORDER_INCLUDE,
      });
      return toOrderResponse(created);
    });
  }

  async findAll(query: FindOrdersQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const where = { status: query.status };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        include: ORDER_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      data: data.map(toOrderResponse),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async findOne(id: string): Promise<OrderResponseDto> {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: ORDER_INCLUDE,
    });
    if (!order) {
      throw new NotFoundException(`Order ${id} not found`);
    }
    return toOrderResponse(order);
  }

  async updateStatus(id: string, dto: UpdateOrderStatusDto): Promise<OrderResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.order.findUnique({
        where: { id },
        include: { items: true },
      });
      if (!current) {
        throw new NotFoundException(`Order ${id} not found`);
      }

      const allowedNextStatuses = ORDER_STATUS_TRANSITIONS[current.status];
      if (!allowedNextStatuses.includes(dto.status)) {
        throw new ConflictException(
          `Cannot transition order from ${current.status} to ${dto.status}`,
        );
      }

      // decision: ORDER_STATUS_TRANSITIONS only lists CANCELLED as a valid target
      // from PENDING or CONFIRMED (SHIPPED/DELIVERED/CANCELLED don't have it in their
      // list). So having passed the check above with dto.status === CANCELLED already
      // proves current.status was PENDING or CONFIRMED — re-checking the source state
      // here would just duplicate what the transition table already enforced.
      if (dto.status === OrderStatus.CANCELLED) {
        for (const item of current.items) {
          await this.inventoryService.applyMovement(
            item.productId,
            MovementType.IN,
            item.quantity,
            `Restock from cancelled order ${id}`,
            id,
            tx,
          );
        }
      }

      const updated = await tx.order.update({
        where: { id },
        data: { status: dto.status },
        include: ORDER_INCLUDE,
      });
      return toOrderResponse(updated);
    });
  }
}
