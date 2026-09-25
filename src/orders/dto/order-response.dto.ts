import { ApiProperty } from '@nestjs/swagger';
import { OrderStatus } from '../../generated/prisma/enums';
import { OrderItemResponseDto } from './order-item-response.dto';

export class OrderResponseDto {
  @ApiProperty({
    description: 'Unique identifier of the order.',
    example: 'cae376cf-1216-49aa-a6df-9948c211e4af',
  })
  id: string;

  @ApiProperty({
    description: 'Name of the customer who placed the order.',
    example: 'Juan Pérez',
  })
  customerName: string;

  @ApiProperty({
    description: 'Delivery address for the order.',
    example: 'Av. Corrientes 1234, CABA',
  })
  address: string;

  @ApiProperty({
    description:
      'Current status. See PATCH /orders/{id}/status for the full list of valid transitions.',
    enum: OrderStatus,
    enumName: 'OrderStatus',
    example: OrderStatus.PENDING,
  })
  status: OrderStatus;

  @ApiProperty({
    description: 'When the order was created.',
    example: '2026-02-01T08:15:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'When the order was last updated (e.g. last status change).',
    example: '2026-02-01T09:00:00.000Z',
  })
  updatedAt: Date;

  @ApiProperty({
    description: 'Line items for this order, each with its own reserved quantity and unit price.',
    type: [OrderItemResponseDto],
  })
  items: OrderItemResponseDto[];
}
