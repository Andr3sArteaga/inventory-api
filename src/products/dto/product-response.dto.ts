import { ApiProperty } from '@nestjs/swagger';
import type { Product } from '../../generated/prisma/client';

export class ProductResponseDto {
  @ApiProperty({
    description: 'Unique product identifier (UUID).',
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  })
  id: string;

  @ApiProperty({
    description: 'Stock Keeping Unit — a unique catalog identifier for the product.',
    example: 'SKU-AUR-001',
  })
  sku: string;

  @ApiProperty({
    description: 'Product display name. Unique among currently active products.',
    example: 'Auricular Bluetooth XYZ',
  })
  name: string;

  @ApiProperty({
    description: 'Free-text description, or null if none was provided.',
    example: 'Auriculares inalámbricos con cancelación de ruido activa.',
    nullable: true,
  })
  description: string | null;

  @ApiProperty({
    description:
      'Current stock level. Only ever changed via the /inventory/movements endpoints ' +
      'or an order reservation/restock — never edited directly through this resource.',
    example: 42,
  })
  stock: number;

  @ApiProperty({
    description: 'Unit price, returned as a string to preserve decimal precision.',
    example: '25999.90',
  })
  price: string;

  @ApiProperty({
    description:
      'Whether the product is active. false means soft-deleted: it stops appearing ' +
      'in listings and lookups return 404, but its history remains queryable.',
    example: true,
  })
  available: boolean;

  @ApiProperty({
    description: 'Timestamp when the product was created.',
    example: '2026-01-15T10:30:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Timestamp of the last update to this product.',
    example: '2026-02-01T08:15:00.000Z',
  })
  updatedAt: Date;

  static fromEntity(product: Product): ProductResponseDto {
    const dto = new ProductResponseDto();
    dto.id = product.id;
    dto.sku = product.sku;
    dto.name = product.name;
    dto.description = product.description;
    dto.stock = product.stock;
    dto.price = product.price.toString();
    dto.available = product.available;
    dto.createdAt = product.createdAt;
    dto.updatedAt = product.updatedAt;
    return dto;
  }
}
