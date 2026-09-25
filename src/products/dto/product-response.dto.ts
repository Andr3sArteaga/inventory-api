import type { Product } from '../../generated/prisma/client';

export class ProductResponseDto {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  stock: number;
  price: string;
  available: boolean;
  createdAt: Date;
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
