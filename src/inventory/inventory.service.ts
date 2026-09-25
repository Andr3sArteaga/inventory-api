import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { MovementType } from '../generated/prisma/enums';
import { CreateMovementDto } from './dto/create-movement.dto';
import { FindMovementsQueryDto } from './dto/find-movements-query.dto';

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Validates and applies a single stock movement (create InventoryMovement + update
   * Product.stock) as one atomic unit.
   *
   * decision: this is the one place that owns "validate then mutate stock". Whether it's
   * called standalone (POST /inventory/movements) or from orders.service reserving/restoring
   * stock for an order, the validation rules and the write must be identical — duplicating
   * this logic in orders.service was explicitly the thing to avoid. The `tx` param is how a
   * caller that already opened its own transaction (order + items + movements) shares that
   * same connection: when `tx` is passed, we run directly on it, so a stock failure on item 3
   * rolls back the order and items created for items 1-2 as well. When `tx` is omitted (the
   * manual-movement endpoint has no outer transaction of its own), we open one here so the
   * movement insert and the stock update still commit or fail together.
   */
  async applyMovement(
    productId: string,
    type: MovementType,
    quantity: number,
    reason?: string | null,
    orderId?: string | null,
    tx?: Prisma.TransactionClient,
  ) {
    if (tx) {
      return this.runMovement(tx, productId, type, quantity, reason, orderId);
    }
    return this.prisma.$transaction((trx) =>
      this.runMovement(trx, productId, type, quantity, reason, orderId),
    );
  }

  private async runMovement(
    client: Prisma.TransactionClient,
    productId: string,
    type: MovementType,
    quantity: number,
    reason?: string | null,
    orderId?: string | null,
  ) {
    // decision: a soft-deleted product (available: false) is treated as "not found"
    // here too, same convention as ProductsService — it's gone from the catalog, not
    // merely "in conflict", so a movement against it is a 404, not a 409.
    const product = await client.product.findFirst({
      where: { id: productId, available: true },
    });
    if (!product) {
      throw new NotFoundException(`Product ${productId} not found`);
    }

    const delta = type === MovementType.IN ? quantity : -quantity;
    const newStock = product.stock + delta;

    if (newStock < 0) {
      throw new UnprocessableEntityException(
        `Movement of ${quantity} ${type} would leave stock at ${newStock} for product ${productId} (current stock: ${product.stock})`,
      );
    }

    const [movement] = await Promise.all([
      client.inventoryMovement.create({
        data: { productId, type, quantity, reason, orderId },
      }),
      client.product.update({
        where: { id: productId },
        data: { stock: newStock },
      }),
    ]);

    return movement;
  }

  create(dto: CreateMovementDto) {
    return this.applyMovement(dto.productId, dto.type, dto.quantity, dto.reason);
  }

  async findAll(query: FindMovementsQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;

    const where: Prisma.InventoryMovementWhereInput = {
      productId: query.productId,
      orderId: query.orderId,
      type: query.type,
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.inventoryMovement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.inventoryMovement.count({ where }),
    ]);

    return {
      data,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }
}
