import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsNumber, IsPositive } from 'class-validator';

export class CreateProductDto {
  @ApiProperty({
    description:
      'Product display name. Must be unique among currently active products ' +
      '(available: true) — creating a second active product with the same name is rejected with 409.',
    example: 'Auricular Bluetooth XYZ',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'Stock Keeping Unit — a unique catalog identifier for the product.',
    example: 'SKU-AUR-001',
  })
  @IsString()
  @IsNotEmpty()
  sku: string; //Stock Keeping Unit, unique identifier for the product

  @ApiPropertyOptional({
    description: 'Free-text description shown to customers.',
    example: 'Auriculares inalámbricos con cancelación de ruido activa.',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    description:
      'Unit price. Must be a positive number; stored as DECIMAL(10,2) in the database.',
    example: 25999.9,
  })
  @IsNumber()
  @IsPositive()
  price: number;
}
