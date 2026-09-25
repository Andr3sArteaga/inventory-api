import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './database/prisma.module';
import { ProductsModule } from './products/products.module';
import { InventoryModule } from './inventory/inventory.module';
import { OrdersModule } from './orders/orders.module';

@Module({
  imports: [PrismaModule, ProductsModule, InventoryModule, OrdersModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
