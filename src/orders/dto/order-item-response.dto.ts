import { ApiProperty } from '@nestjs/swagger';

class OrderItemProductSummaryDto {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  id: string;

  @ApiProperty({ example: 'SKU-AUR-001' })
  sku: string;

  @ApiProperty({ example: 'Auricular Bluetooth XYZ' })
  name: string;
}

export class OrderItemResponseDto {
  @ApiProperty({
    description: 'Unique identifier of this order line item.',
    example: '0b10de09-07e4-46ed-b5a7-b693cf9fb08c',
  })
  id: string;

  @ApiProperty({
    description: 'The order this item belongs to.',
    example: 'cae376cf-1216-49aa-a6df-9948c211e4af',
  })
  orderId: string;

  @ApiProperty({
    description: 'The product ordered.',
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  })
  productId: string;

  @ApiProperty({
    description: 'Quantity ordered.',
    example: 2,
  })
  quantity: number;

  @ApiProperty({
    description:
      "The product's price at the moment the order was placed — copied from " +
      'Product.price so later price changes never affect existing orders.',
    example: '25999.90',
  })
  unitPrice: string;

  @ApiProperty({
    description: 'Basic product info (id, sku, name) for display purposes.',
    type: OrderItemProductSummaryDto,
  })
  product: OrderItemProductSummaryDto;
}
