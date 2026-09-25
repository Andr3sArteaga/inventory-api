import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './database/prisma.module';
import { ProductsModule } from './products/products.module';
import { InventoryModule } from './inventory/inventory.module';

@Module({
  imports: [PrismaModule, ProductsModule, InventoryModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
