import { ApiProperty } from '@nestjs/swagger';
import { MovementType } from '../../generated/prisma/enums';

export class MovementResponseDto {
  @ApiProperty({
    description: 'Unique identifier of this movement.',
    example: '5410534b-8a00-4fbe-a03c-6cc4d0eee963',
  })
  id: string;

  @ApiProperty({
    description: 'The product this movement affected.',
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  })
  productId: string;

  @ApiProperty({
    description: 'Direction of the movement.',
    enum: MovementType,
    enumName: 'MovementType',
    example: MovementType.OUT,
  })
  type: MovementType;

  @ApiProperty({
    description: 'Quantity moved (always positive; direction is carried by `type`).',
    example: 3,
  })
  quantity: number;

  @ApiProperty({
    description: 'Reason for the movement, or null for movements without one.',
    example: 'Reserve for order cae376cf-1216-49aa-a6df-9948c211e4af',
    nullable: true,
  })
  reason: string | null;

  @ApiProperty({
    description:
      'The order that triggered this movement (reservation or cancellation restock), ' +
      'or null for a manual movement created directly through this endpoint.',
    example: null,
    nullable: true,
  })
  orderId: string | null;

  @ApiProperty({
    description: 'When this movement was recorded.',
    example: '2026-02-01T08:15:00.000Z',
  })
  createdAt: Date;
}
