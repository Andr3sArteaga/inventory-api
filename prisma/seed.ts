import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { ActionType } from '../src/generated/prisma/enums';

const sampleProducts = [
  {
    sku: 'SKU-DEMO-001',
    name: 'Auricular Bluetooth XYZ',
    description: 'Auriculares inalámbricos con cancelación de ruido activa.',
    price: 25999.9,
  },
  {
    sku: 'SKU-DEMO-002',
    name: 'Teclado Mecánico RGB',
    description: 'Teclado mecánico con switches rojos y retroiluminación RGB.',
    price: 45999,
  },
  {
    sku: 'SKU-DEMO-003',
    name: 'Mouse Inalámbrico Pro',
    description: 'Mouse ergonómico con sensor óptico de alta precisión.',
    price: 15999.5,
  },
  {
    sku: 'SKU-DEMO-004',
    name: 'Monitor 27" 144Hz',
    description: 'Monitor gamer Full HD, 144Hz, 1ms de tiempo de respuesta.',
    price: 189999,
  },
];

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  for (const product of sampleProducts) {
    const existingBySku = await prisma.product.findFirst({ where: { sku: product.sku } });
    const existingByName = await prisma.product.findFirst({
      where: { name: product.name, available: true },
    });
    if (existingBySku || existingByName) {
      console.log(`Ya existe (se omite): ${product.sku} — ${product.name}`);
      continue;
    }

    const created = await prisma.product.create({ data: product });
    await prisma.productHistory.create({
      data: {
        productId: created.id,
        action: ActionType.CREATE,
        changes: {
          sku: product.sku,
          name: product.name,
          description: product.description,
          price: product.price.toString(),
        },
      },
    });
    console.log(`Creado: ${product.sku} — ${product.name}`);
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
