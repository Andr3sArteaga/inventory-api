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
    // decision: the stock check and the stock write used to be a findFirst (read
    // stock into JS) followed by a separate update(newStock) — classic read-modify-write.
    // Under real concurrency, two applyMovement calls on the same product can both run
    // their findFirst before either writes, both see the same "old" stock, both compute
    // a delta that looks valid on its own, and both commit — landing stock below zero
    // even though each call individually checked it. Folding the validity check into the
    // WHERE clause of a single updateMany fixes this: Postgres takes a row lock for the
    // UPDATE, so the two concurrent calls are serialized by the database itself. The
    // first one to commit changes the row; the second one's WHERE (stock >= quantity)
    // is then evaluated against the ALREADY-updated stock, not stale data, so it matches
    // zero rows instead of double-applying. No application-level lock or retry needed —
    // Postgres is doing the serializing.
    const where: Prisma.ProductWhereInput =
      type === MovementType.OUT
        ? { id: productId, available: true, stock: { gte: quantity } }
        : { id: productId, available: true };

    const data: Prisma.ProductUpdateManyMutationInput =
      type === MovementType.OUT
        ? { stock: { decrement: quantity } }
        : { stock: { increment: quantity } };

    const result = await client.product.updateMany({ where, data });

    if (result.count === 0) {
      // decision: updateMany's `count` says the WHERE matched nothing, but not why —
      // missing product, soft-deleted product, and insufficient stock all produce
      // count: 0. This findFirst runs only on this failure path (never on the success
      // path, which is the common case) purely to build an accurate error message; it
      // does not get a vote on whether the movement was valid — the updateMany above
      // already decided that atomically, before this line ever runs.
      const product = await client.product.findFirst({
        where: { id: productId, available: true },
      });
      if (!product) {
        throw new NotFoundException(`Product ${productId} not found`);
      }
      throw new UnprocessableEntityException(
        `Movement of ${quantity} ${type} would leave stock at ${
          product.stock - quantity
        } for product ${productId} (current stock: ${product.stock})`,
      );
    }

    return client.inventoryMovement.create({
      data: { productId, type, quantity, reason, orderId },
    });
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
