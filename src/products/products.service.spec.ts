import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { ActionType } from '../generated/prisma/enums';
import { ProductsService } from './products.service';

describe('ProductsService', () => {
  let service: ProductsService;
  let prisma: {
    product: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
    productHistory: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let tx: {
    product: { create: jest.Mock; update: jest.Mock; findFirst: jest.Mock };
    productHistory: { create: jest.Mock };
  };

  const mockProduct = (overrides: Record<string, unknown> = {}) => ({
    id: 'prod-1',
    sku: 'SKU-1',
    name: 'Widget',
    description: 'A widget',
    stock: 0,
    price: 10,
    available: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  });

  beforeEach(async () => {
    tx = {
      product: {
        create: jest.fn(),
        update: jest.fn(),
        findFirst: jest.fn(),
      },
      productHistory: {
        create: jest.fn(),
      },
    };

    prisma = {
      product: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      productHistory: {
        findMany: jest.fn(),
      },
      $transaction: jest.fn((callback: (client: unknown) => unknown) => callback(tx)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ProductsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(ProductsService);
  });

  describe('create', () => {
    it('1. creates the product and a CREATE history entry inside the same transaction', async () => {
      prisma.product.findFirst.mockResolvedValue(null); // pre-check: no active duplicate
      const created = mockProduct({
        sku: 'SKU-1',
        name: 'Widget',
        description: 'A widget',
        price: 10,
      });
      tx.product.create.mockResolvedValue(created);
      tx.productHistory.create.mockResolvedValue({ id: 'hist-1' });

      const dto = { sku: 'SKU-1', name: 'Widget', description: 'A widget', price: 10 };
      await service.create(dto as never);

      expect(tx.product.create).toHaveBeenCalledWith({ data: dto });
      expect(tx.productHistory.create).toHaveBeenCalledWith({
        data: {
          productId: 'prod-1',
          action: ActionType.CREATE,
          changes: { sku: 'SKU-1', name: 'Widget', description: 'A widget', price: '10' },
        },
      });
    });

    it('2. rejects via the pre-check when an active product with the same name exists, and never attempts the insert', async () => {
      prisma.product.findFirst.mockResolvedValue(mockProduct({ name: 'Widget' }));

      const dto = { sku: 'SKU-2', name: 'Widget', price: 10 };
      await expect(service.create(dto as never)).rejects.toThrow(ConflictException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(tx.product.create).not.toHaveBeenCalled();
    });

    it('3. rejects via the P2002 catch when the pre-check passes but the DB constraint still fires (race condition)', async () => {
      prisma.product.findFirst.mockResolvedValue(null); // pre-check finds nothing
      tx.product.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError(
          'Unique constraint failed on the constraint: `ux_product_active_name`',
          { code: 'P2002', clientVersion: '7.10.0' },
        ),
      );

      const dto = { sku: 'SKU-3', name: 'Widget', price: 10 };
      await expect(service.create(dto as never)).rejects.toThrow(ConflictException);

      // The pre-check DID run and DID pass (that's the whole point of this test) — proof
      // that this failure came from the catch branch, not the pre-check branch.
      expect(prisma.product.findFirst).toHaveBeenCalledTimes(1);
      expect(tx.product.create).toHaveBeenCalledTimes(1);
      expect(tx.productHistory.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('4. does not create a history entry when nothing actually changed', async () => {
      const current = mockProduct({
        sku: 'SKU-1',
        name: 'Widget',
        description: 'A widget',
        price: 10,
      });
      tx.product.findFirst.mockResolvedValue(current);
      tx.product.update.mockResolvedValue(current);

      const dto = { sku: 'SKU-1', name: 'Widget', description: 'A widget', price: 10 };
      await service.update('prod-1', dto as never);

      expect(tx.productHistory.create).not.toHaveBeenCalled();
    });

    it('5. records an UPDATE history entry with the exact from/to shape when one field changes', async () => {
      const current = mockProduct({ price: 10 });
      tx.product.findFirst.mockResolvedValue(current);
      tx.product.update.mockResolvedValue(mockProduct({ price: 15 }));

      const dto = { price: 15 };
      await service.update('prod-1', dto as never);

      expect(tx.productHistory.create).toHaveBeenCalledWith({
        data: {
          productId: 'prod-1',
          action: ActionType.UPDATE,
          changes: { price: { from: '10', to: '15' } },
        },
      });
    });

    it('6. records both fields in changes when two fields change at once', async () => {
      const current = mockProduct({ name: 'Old Name', price: 10 });
      tx.product.findFirst.mockResolvedValue(current);
      tx.product.update.mockResolvedValue(mockProduct({ name: 'New Name', price: 20 }));

      const dto = { name: 'New Name', price: 20 };
      await service.update('prod-1', dto as never);

      expect(tx.productHistory.create).toHaveBeenCalledWith({
        data: {
          productId: 'prod-1',
          action: ActionType.UPDATE,
          changes: {
            name: { from: 'Old Name', to: 'New Name' },
            price: { from: '10', to: '20' },
          },
        },
      });
    });

    it('7. throws NotFoundException and never updates or records history when the product does not exist', async () => {
      tx.product.findFirst.mockResolvedValue(null);

      await expect(service.update('missing', { price: 5 } as never)).rejects.toThrow(
        NotFoundException,
      );
      expect(tx.product.update).not.toHaveBeenCalled();
      expect(tx.productHistory.create).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('8. soft-deletes (available: false) and records a DELETE history entry', async () => {
      const current = mockProduct({
        sku: 'SKU-1',
        name: 'Widget',
        description: 'A widget',
        price: 10,
      });
      tx.product.findFirst.mockResolvedValue(current);
      tx.product.update.mockResolvedValue(mockProduct({ available: false }));

      await service.remove('prod-1');

      expect(tx.product.update).toHaveBeenCalledWith({
        where: { id: 'prod-1' },
        data: { available: false },
      });
      expect(tx.productHistory.create).toHaveBeenCalledWith({
        data: {
          productId: 'prod-1',
          action: ActionType.DELETE,
          changes: { sku: 'SKU-1', name: 'Widget', description: 'A widget', price: '10' },
        },
      });
    });

    it('9. throws NotFoundException when the product is already soft-deleted or never existed', async () => {
      // remove()'s findFirst filters by available: true, so a soft-deleted product and a
      // missing one both resolve null here — same convention used everywhere else.
      tx.product.findFirst.mockResolvedValue(null);

      await expect(service.remove('prod-1')).rejects.toThrow(NotFoundException);
      expect(tx.product.update).not.toHaveBeenCalled();
      expect(tx.productHistory.create).not.toHaveBeenCalled();
    });
  });

  describe('getHistory', () => {
    it('10. returns the full history even when the product is soft-deleted', async () => {
      prisma.product.findUnique.mockResolvedValue(mockProduct({ available: false }));
      const history = [{ id: 'hist-1', action: ActionType.DELETE }];
      prisma.productHistory.findMany.mockResolvedValue(history);

      const result = await service.getHistory('prod-1');

      expect(prisma.product.findUnique).toHaveBeenCalledWith({ where: { id: 'prod-1' } });
      expect(result).toBe(history);
    });

    it('11. throws NotFoundException when the product never existed', async () => {
      prisma.product.findUnique.mockResolvedValue(null);

      await expect(service.getHistory('missing')).rejects.toThrow(NotFoundException);
      expect(prisma.productHistory.findMany).not.toHaveBeenCalled();
    });
  });
});
