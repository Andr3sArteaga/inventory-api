import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.config';
import { PrismaService } from '../../src/database/prisma.service';
import { cleanDatabase } from './utils/clean-database';

describe('Orders (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = moduleFixture.get(PrismaService);
    await cleanDatabase(prisma);
  });

  afterAll(async () => {
    await cleanDatabase(prisma);
    await app.close();
  });

  it('4. an invalid status transition (PENDING -> DELIVERED) is rejected with 409', async () => {
    const productResponse = await request(app.getHttpServer())
      .post('/products')
      .send({ name: 'E2E Order Widget A', sku: 'SKU-E2E-ORD-A', price: 10 })
      .expect(201);
    const productId = productResponse.body.id;

    await request(app.getHttpServer())
      .post('/inventory/movements')
      .send({ productId, type: 'IN', quantity: 10 })
      .expect(201);

    const orderResponse = await request(app.getHttpServer())
      .post('/orders')
      .send({
        customerName: 'Juan Perez',
        address: 'Calle Falsa 123',
        items: [{ productId, quantity: 1 }],
      })
      .expect(201);
    expect(orderResponse.body.status).toBe('PENDING');
    const orderId = orderResponse.body.id;

    const statusResponse = await request(app.getHttpServer())
      .patch(`/orders/${orderId}/status`)
      .send({ status: 'DELIVERED' })
      .expect(409);

    expect(statusResponse.body.message).toMatch(/PENDING/);
    expect(statusResponse.body.message).toMatch(/DELIVERED/);
  });

  it('5. ordering more than the available stock is rejected with 422 and leaves stock untouched', async () => {
    const productResponse = await request(app.getHttpServer())
      .post('/products')
      .send({ name: 'E2E Order Widget B', sku: 'SKU-E2E-ORD-B', price: 10 })
      .expect(201);
    const productId = productResponse.body.id;

    await request(app.getHttpServer())
      .post('/inventory/movements')
      .send({ productId, type: 'IN', quantity: 2 })
      .expect(201);

    await request(app.getHttpServer())
      .post('/orders')
      .send({
        customerName: 'Maria Lopez',
        address: 'Otra Calle 456',
        items: [{ productId, quantity: 100 }],
      })
      .expect(422);

    const productAfter = await request(app.getHttpServer())
      .get(`/products/${productId}`)
      .expect(200);
    expect(productAfter.body.stock).toBe(2);
  });
});
