import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../database/prisma.service';
import { MovementType } from '../generated/prisma/enums';
import { InventoryService } from './inventory.service';

describe('InventoryService', () => {
  let service: InventoryService;
  let prisma: { $transaction: jest.Mock };
  let client: {
    product: { updateMany: jest.Mock; findFirst: jest.Mock };
    inventoryMovement: { create: jest.Mock };
  };

  beforeEach(async () => {
    client = {
      product: {
        updateMany: jest.fn(),
        findFirst: jest.fn(),
      },
      inventoryMovement: {
        create: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryService,
        {
          provide: PrismaService,
          useValue: {
            // No externally-provided tx -> applyMovement opens its own transaction here,
            // running the callback against our fake `client` transaction proxy.
            $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(client)),
          },
        },
      ],
    }).compile();

    service = module.get(InventoryService);
    prisma = module.get(PrismaService) as unknown as { $transaction: jest.Mock };
  });

  describe('applyMovement — no external tx (standalone endpoint)', () => {
    it('applies a valid IN movement: updates stock and creates the movement', async () => {
      client.product.updateMany.mockResolvedValue({ count: 1 });
      client.inventoryMovement.create.mockResolvedValue({
        id: 'mv-1',
        productId: 'prod-1',
        type: MovementType.IN,
        quantity: 10,
        reason: 'restock',
        orderId: null,
        createdAt: new Date(),
      });

      const result = await service.applyMovement('prod-1', MovementType.IN, 10, 'restock');

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(client.product.updateMany).toHaveBeenCalledWith({
        where: { id: 'prod-1', available: true },
        data: { stock: { increment: 10 } },
      });
      expect(client.inventoryMovement.create).toHaveBeenCalledWith({
        data: { productId: 'prod-1', type: MovementType.IN, quantity: 10, reason: 'restock', orderId: undefined },
      });
      expect(result).toMatchObject({ id: 'mv-1', type: MovementType.IN });
    });

    it('applies a valid OUT movement when stock is sufficient', async () => {
      client.product.updateMany.mockResolvedValue({ count: 1 });
      client.inventoryMovement.create.mockResolvedValue({
        id: 'mv-2',
        productId: 'prod-1',
        type: MovementType.OUT,
        quantity: 4,
        reason: null,
        orderId: null,
        createdAt: new Date(),
      });

      const result = await service.applyMovement('prod-1', MovementType.OUT, 4);

      expect(client.product.updateMany).toHaveBeenCalledWith({
        where: { id: 'prod-1', available: true, stock: { gte: 4 } },
        data: { stock: { decrement: 4 } },
      });
      expect(client.product.findFirst).not.toHaveBeenCalled();
      expect(result).toMatchObject({ id: 'mv-2', type: MovementType.OUT });
    });

    it('rejects an OUT movement that would leave stock negative, without ever creating a movement', async () => {
      client.product.updateMany.mockResolvedValue({ count: 0 });
      client.product.findFirst.mockResolvedValue({
        id: 'prod-1',
        available: true,
        stock: 3,
      });

      await expect(
        service.applyMovement('prod-1', MovementType.OUT, 10),
      ).rejects.toThrow(UnprocessableEntityException);

      // decision: the diagnostic findFirst runs with the SAME `available: true` filter as
      // the updateMany's own WHERE — it exists only to explain WHY count came back 0, never
      // to re-decide validity. Asserting its exact args here also documents that a
      // soft-deleted product and "ran out of stock" are told apart by this call alone.
      expect(client.product.findFirst).toHaveBeenCalledWith({
        where: { id: 'prod-1', available: true },
      });
      expect(client.inventoryMovement.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the product does not exist', async () => {
      client.product.updateMany.mockResolvedValue({ count: 0 });
      client.product.findFirst.mockResolvedValue(null);

      await expect(
        service.applyMovement('missing-product', MovementType.IN, 5),
      ).rejects.toThrow(NotFoundException);
      expect(client.inventoryMovement.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundException (not Conflict) when the product is soft-deleted', async () => {
      // The updateMany's WHERE already has available: true, so a soft-deleted product
      // makes it match zero rows exactly like a missing product would. The diagnostic
      // findFirst below uses that same available: true filter, so it also comes back
      // null for a soft-deleted product — there's no separate "ignore available" query;
      // both "never existed" and "soft-deleted" collapse to the same NotFoundException
      // path, matching the convention ProductsService uses everywhere else.
      client.product.updateMany.mockResolvedValue({ count: 0 });
      client.product.findFirst.mockResolvedValue(null);

      await expect(
        service.applyMovement('soft-deleted-product', MovementType.IN, 5),
      ).rejects.toThrow(NotFoundException);
      expect(client.product.findFirst).toHaveBeenCalledWith({
        where: { id: 'soft-deleted-product', available: true },
      });
      expect(client.inventoryMovement.create).not.toHaveBeenCalled();
    });
  });

  describe('applyMovement — external tx (called from orders.service)', () => {
    it('runs directly on the provided tx and never opens its own transaction', async () => {
      const externalTx = {
        product: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          findFirst: jest.fn(),
        },
        inventoryMovement: {
          create: jest.fn().mockResolvedValue({ id: 'mv-3' }),
        },
      };

      await service.applyMovement(
        'prod-1',
        MovementType.OUT,
        2,
        'Reserve for order order-1',
        'order-1',
        externalTx as never,
      );

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(externalTx.product.updateMany).toHaveBeenCalledWith({
        where: { id: 'prod-1', available: true, stock: { gte: 2 } },
        data: { stock: { decrement: 2 } },
      });
      expect(externalTx.inventoryMovement.create).toHaveBeenCalledWith({
        data: {
          productId: 'prod-1',
          type: MovementType.OUT,
          quantity: 2,
          reason: 'Reserve for order order-1',
          orderId: 'order-1',
        },
      });
      // The mocked PrismaService's own client/tx (`client`, set up in beforeEach) must
      // stay untouched — proof that applyMovement didn't fall back to opening its own
      // transaction alongside the caller's.
      expect(client.product.updateMany).not.toHaveBeenCalled();
    });
  });
});
