import { PrismaService } from '../../../src/database/prisma.service';

// decision: deletes in FK-dependency order (children before parents) — InventoryMovement
// and OrderItem both reference Product and/or Order with onDelete: Restrict, and
// ProductHistory references Product the same way, so any of those has to go before the
// Order/Product rows they point at, or Postgres rejects the delete with a constraint
// violation instead of an empty table. Runs at the start AND end of every e2e suite so
// a run is repeatable (no leftovers from a previous run to collide with a unique
// constraint) and never leaves the test database dirty for whichever suite runs next.
//
// This wipes the WHOLE table, not just rows this suite created — fine as long as e2e
// spec files never run concurrently against the same database. Jest runs test FILES in
// parallel worker processes by default, so two suites sharing this test database could
// otherwise interleave: one's cleanDatabase() deleting a product mid-test while the
// other suite still holds an OrderItem pointing at it. That's why `npm run test:e2e`
// passes --runInBand — e2e suites here are sequential by design, not an oversight.
export async function cleanDatabase(prisma: PrismaService): Promise<void> {
  await prisma.inventoryMovement.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.productHistory.deleteMany();
  await prisma.order.deleteMany();
  await prisma.product.deleteMany();
}
