import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.config';
import { PrismaService } from '../../src/database/prisma.service';
import { cleanDatabase } from './utils/clean-database';

describe('Products (e2e)', () => {
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

  it('1. POST /products with valid data -> 201, with a generated id and available: true', async () => {
    const response = await request(app.getHttpServer())
      .post('/products')
      .send({
        name: 'E2E Bluetooth Headphones',
        sku: 'SKU-E2E-001',
        description: 'Created by the products e2e suite',
        price: 19999.9,
      })
      .expect(201);

    expect(response.body.id).toBeDefined();
    expect(typeof response.body.id).toBe('string');
    expect(response.body.available).toBe(true);
    expect(response.body.stock).toBe(0);
  });

  it('2. POST /products with price: -5 -> 400, and the validation message mentions price', async () => {
    const response = await request(app.getHttpServer())
      .post('/products')
      .send({
        name: 'E2E Invalid Price Product',
        sku: 'SKU-E2E-002',
        price: -5,
      })
      .expect(400);

    expect(Array.isArray(response.body.message)).toBe(true);
    expect(response.body.message.join(' ')).toMatch(/price/i);
  });

  it('3. creating a second active product with the same name -> 409', async () => {
    await request(app.getHttpServer())
      .post('/products')
      .send({
        name: 'E2E Duplicate Name Product',
        sku: 'SKU-E2E-003',
        price: 9.99,
      })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post('/products')
      .send({
        name: 'E2E Duplicate Name Product',
        sku: 'SKU-E2E-004',
        price: 5,
      })
      .expect(409);

    expect(response.body.error).toBe('Conflict');
  });
});
