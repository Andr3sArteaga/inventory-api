import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../database/prisma.service';
import { MovementType, OrderStatus } from '../generated/prisma/enums';
import { InventoryService } from '../inventory/inventory.service';
import { OrdersService } from './orders.service';

describe('OrdersService', () => {
  let service: OrdersService;
  let inventoryService: { applyMovement: jest.Mock };
  let tx: {
    order: {
      findUnique: jest.Mock;
      update: jest.Mock;
      create: jest.Mock;
      findUniqueOrThrow: jest.Mock;
    };
    product: { findMany: jest.Mock };
  };

  const twoItems = [
    { id: 'item-1', orderId: 'order-1', productId: 'prod-1', quantity: 2 },
    { id: 'item-2', orderId: 'order-1', productId: 'prod-2', quantity: 3 },
  ];

  const withProductInclude = (items: typeof twoItems) =>
    items.map((item) => ({
      ...item,
      unitPrice: 10,
      product: { id: item.productId, sku: `SKU-${item.productId}`, name: `Product ${item.productId}` },
    }));

  const mockOrder = (status: OrderStatus, items: unknown[] = twoItems) => ({
    id: 'order-1',
    customerName: 'Juan Perez',
    address: 'Calle Falsa 123',
    status,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    items,
  });

  beforeEach(async () => {
    tx = {
      order: {
        findUnique: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
      product: {
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        {
          provide: PrismaService,
          useValue: {
            $transaction: jest.fn((callback: (client: unknown) => unknown) => callback(tx)),
          },
        },
        {
          provide: InventoryService,
          useValue: { applyMovement: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(OrdersService);
    inventoryService = module.get(InventoryService) as unknown as { applyMovement: jest.Mock };
  });

  describe('updateStatus — the state machine', () => {
    const expectTransitionAllowed = async (from: OrderStatus, to: OrderStatus) => {
      tx.order.findUnique.mockResolvedValue(mockOrder(from));
      tx.order.update.mockResolvedValue(mockOrder(to, withProductInclude(twoItems)));
      inventoryService.applyMovement.mockResolvedValue({ id: 'mv-x' });

      const result = await service.updateStatus('order-1', { status: to });

      expect(result.status).toBe(to);
      expect(tx.order.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'order-1' }, data: { status: to } }),
      );
    };

    const expectTransitionRejected = async (from: OrderStatus, to: OrderStatus) => {
      tx.order.findUnique.mockResolvedValue(mockOrder(from));

      await expect(service.updateStatus('order-1', { status: to })).rejects.toThrow(
        ConflictException,
      );
      await expect(service.updateStatus('order-1', { status: to })).rejects.toThrow(
        `Cannot transition order from ${from} to ${to}`,
      );
      expect(tx.order.update).not.toHaveBeenCalled();
    };

    it('1. PENDING -> CONFIRMED: allowed', async () => {
      await expectTransitionAllowed(OrderStatus.PENDING, OrderStatus.CONFIRMED);
    });

    it('2. CONFIRMED -> SHIPPED: allowed', async () => {
      await expectTransitionAllowed(OrderStatus.CONFIRMED, OrderStatus.SHIPPED);
    });

    it('3. SHIPPED -> DELIVERED: allowed', async () => {
      await expectTransitionAllowed(OrderStatus.SHIPPED, OrderStatus.DELIVERED);
    });

    it('4. PENDING -> CANCELLED: allowed', async () => {
      await expectTransitionAllowed(OrderStatus.PENDING, OrderStatus.CANCELLED);
    });

    it('5. CONFIRMED -> CANCELLED: allowed', async () => {
      await expectTransitionAllowed(OrderStatus.CONFIRMED, OrderStatus.CANCELLED);
    });

    it('6. PENDING -> DELIVERED: rejected with ConflictException', async () => {
      await expectTransitionRejected(OrderStatus.PENDING, OrderStatus.DELIVERED);
    });

    it('7. SHIPPED -> CANCELLED: rejected with ConflictException (already shipped)', async () => {
      await expectTransitionRejected(OrderStatus.SHIPPED, OrderStatus.CANCELLED);
    });

    it('8. DELIVERED is terminal: every other status is rejected', async () => {
      for (const to of [
        OrderStatus.PENDING,
        OrderStatus.CONFIRMED,
        OrderStatus.SHIPPED,
        OrderStatus.CANCELLED,
      ]) {
        tx.order.findUnique.mockResolvedValue(mockOrder(OrderStatus.DELIVERED));
        await expect(service.updateStatus('order-1', { status: to })).rejects.toThrow(
          ConflictException,
        );
      }
      expect(tx.order.update).not.toHaveBeenCalled();
    });

    it('9. CANCELLED is terminal: every other status is rejected', async () => {
      for (const to of [
        OrderStatus.PENDING,
        OrderStatus.CONFIRMED,
        OrderStatus.SHIPPED,
        OrderStatus.DELIVERED,
      ]) {
        tx.order.findUnique.mockResolvedValue(mockOrder(OrderStatus.CANCELLED));
        await expect(service.updateStatus('order-1', { status: to })).rejects.toThrow(
          ConflictException,
        );
      }
      expect(tx.order.update).not.toHaveBeenCalled();
    });

    it('10. cancelling from PENDING restocks every item: applyMovement(IN) called once per item', async () => {
      tx.order.findUnique.mockResolvedValue(mockOrder(OrderStatus.PENDING, twoItems));
      tx.order.update.mockResolvedValue(
        mockOrder(OrderStatus.CANCELLED, withProductInclude(twoItems)),
      );
      inventoryService.applyMovement.mockResolvedValue({ id: 'mv-x' });

      await service.updateStatus('order-1', { status: OrderStatus.CANCELLED });

      expect(inventoryService.applyMovement).toHaveBeenCalledTimes(2);
      expect(inventoryService.applyMovement).toHaveBeenNthCalledWith(
        1,
        'prod-1',
        MovementType.IN,
        2,
        'Restock from cancelled order order-1',
        'order-1',
        tx,
      );
      expect(inventoryService.applyMovement).toHaveBeenNthCalledWith(
        2,
        'prod-2',
        MovementType.IN,
        3,
        'Restock from cancelled order order-1',
        'order-1',
        tx,
      );
    });

    it('10b. cancelling from CONFIRMED also restocks every item', async () => {
      tx.order.findUnique.mockResolvedValue(mockOrder(OrderStatus.CONFIRMED, twoItems));
      tx.order.update.mockResolvedValue(
        mockOrder(OrderStatus.CANCELLED, withProductInclude(twoItems)),
      );
      inventoryService.applyMovement.mockResolvedValue({ id: 'mv-x' });

      await service.updateStatus('order-1', { status: OrderStatus.CANCELLED });

      expect(inventoryService.applyMovement).toHaveBeenCalledTimes(2);
    });

    it('11. a non-CANCELLED transition never touches inventory', async () => {
      tx.order.findUnique.mockResolvedValue(mockOrder(OrderStatus.CONFIRMED, twoItems));
      tx.order.update.mockResolvedValue(
        mockOrder(OrderStatus.SHIPPED, withProductInclude(twoItems)),
      );

      await service.updateStatus('order-1', { status: OrderStatus.SHIPPED });

      expect(inventoryService.applyMovement).not.toHaveBeenCalled();
    });
  });

  describe('create — atomic stock reservation', () => {
    it('12. propagates the UnprocessableEntityException from a failed reservation instead of swallowing it', async () => {
      tx.product.findMany.mockResolvedValue([
        { id: 'prod-1', price: 10, available: true },
        { id: 'prod-2', price: 20, available: true },
      ]);
      tx.order.create.mockResolvedValue({ id: 'order-1' });

      inventoryService.applyMovement
        .mockResolvedValueOnce({ id: 'mv-1' }) // item 1 reserves fine
        .mockRejectedValueOnce(new UnprocessableEntityException('insufficient stock')); // item 2 fails

      const dto = {
        customerName: 'Juan Perez',
        address: 'Calle Falsa 123',
        items: [
          { productId: 'prod-1', quantity: 1 },
          { productId: 'prod-2', quantity: 999 },
        ],
      };

      await expect(service.create(dto)).rejects.toThrow(UnprocessableEntityException);
      expect(inventoryService.applyMovement).toHaveBeenCalledTimes(2);
      // The order was never re-fetched for the response — proof the exception aborted
      // the transaction before reaching that point, instead of being caught and ignored.
      expect(tx.order.findUniqueOrThrow).not.toHaveBeenCalled();
    });
  });
});
