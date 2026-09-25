import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsPositive,
  IsString,
  IsUUID,
  Matches,
  ValidateNested,
} from 'class-validator';

export class OrderItemDto {
  @ApiProperty({
    description: 'The product being ordered. Must be an active product with enough stock.',
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  })
  @IsUUID()
  productId: string;

  @ApiProperty({
    description: 'Quantity of this product to order. Must be a positive integer.',
    example: 2,
  })
  @IsInt()
  @IsPositive()
  quantity: number;
}

export class CreateOrderDto {
  @ApiProperty({
    description:
      'Name of the customer placing the order. Letters and spaces only — rejects names ' +
      'made up entirely of numbers or symbols.',
    example: 'Juan Pérez',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-zA-ZÀ-ÿ\s]+$/, {
    message: 'customerName must contain only letters and spaces',
  })
  customerName: string;

  @ApiProperty({
    description: 'Delivery address for the order.',
    example: 'Av. Corrientes 1234, CABA',
  })
  @IsString()
  @IsNotEmpty()
  address: string;

  @ApiProperty({
    description:
      'Line items for this order. At least one is required. The current price of each ' +
      'product is copied into unitPrice at creation time, and stock is reserved ' +
      '(OUT movement) for every item atomically — if any item lacks enough stock, the ' +
      'whole order is rolled back.',
    type: [OrderItemDto],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];
}
